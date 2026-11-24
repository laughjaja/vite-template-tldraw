import crypto from 'node:crypto'
import { GoogleGenAI, Type, type Content, type FunctionDeclaration, type Part } from '@google/genai'

export const maxDuration = 60

const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash'
const SUPPORTED_GEMINI_MODELS = [
	'gemini-3.6-flash',
	'gemini-3.5-flash',
	'gemini-3.5-flash-lite',
	'gemini-3.8-flash',
] as const

const COLOR_VALUES = [
	'black',
	'grey',
	'light-violet',
	'violet',
	'blue',
	'light-blue',
	'yellow',
	'orange',
	'green',
	'light-green',
	'light-red',
	'red',
	'white',
]
const FILL_VALUES = ['none', 'semi', 'solid', 'pattern', 'fill']
const SIZE_VALUES = ['s', 'm', 'l', 'xl']
const GEO_VALUES = [
	'rectangle',
	'ellipse',
	'diamond',
	'oval',
	'triangle',
	'hexagon',
	'pentagon',
	'octagon',
	'star',
	'cloud',
	'trapezoid',
	'rhombus',
	'check-box',
	'x-box',
	'heart',
	'arrow-right',
	'arrow-left',
	'arrow-up',
	'arrow-down',
]

const AGENT_SYSTEM_INSTRUCTION = `You are a Gemini AI canvas assistant embedded directly inside a tldraw infinite whiteboard application (jastldraw).

You can see the user's real tldraw canvas (every shape's ID, type, position, size, text/label, color, connectors/bindings, parent frames, lock state, which shapes the user currently selected, all pages, editor mode, the current viewport bounds, and optionally a visual screenshot of the canvas) and you can directly modify the canvas using your tools.

## Core Principles
1. Be genuinely canvas-aware: inspect \`canvasContext.shapes\` and \`canvasContext.selectedShapeIds\` carefully and never hallucinate shape IDs.
2. Choose the right tool:
   - Flowcharts/architecture diagrams: \`create_flowchart\`
   - Mermaid diagrams: \`create_mermaid_diagram\`
   - Kanban boards: \`create_kanban_board\` and \`add_kanban_card\`
   - In-canvas editable documents: \`create_document\` and \`update_document\`
   - Individual shapes & connectors: \`create_shape\`, \`create_connector\`, \`create_embed\`
   - Organizing/editing: \`update_shape\`, \`move_shapes\`, \`arrange_shapes\`, \`manage_shapes\`, \`delete_shapes\`, \`manage_page\`, \`select_and_focus\`.
3. Keep responses concise, helpful, and grounded in what was actually read or changed on the canvas.`

const AGENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
	{
		name: 'create_shape',
		description: 'Create an editable tldraw shape: geo, text, note, or frame.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				refId: { type: Type.STRING },
				kind: { type: Type.STRING, enum: ['geo', 'text', 'note', 'frame'] },
				geo: { type: Type.STRING, enum: GEO_VALUES },
				text: { type: Type.STRING },
				x: { type: Type.NUMBER },
				y: { type: Type.NUMBER },
				w: { type: Type.NUMBER },
				h: { type: Type.NUMBER },
				color: { type: Type.STRING, enum: COLOR_VALUES },
				fill: { type: Type.STRING, enum: FILL_VALUES },
				size: { type: Type.STRING, enum: SIZE_VALUES },
			},
			required: ['kind'],
		},
	},
	{
		name: 'create_connector',
		description: 'Create a bound arrow connector between two shapes or page coordinates.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				fromId: { type: Type.STRING },
				toId: { type: Type.STRING },
				startX: { type: Type.NUMBER },
				startY: { type: Type.NUMBER },
				endX: { type: Type.NUMBER },
				endY: { type: Type.NUMBER },
				label: { type: Type.STRING },
				color: { type: Type.STRING, enum: COLOR_VALUES },
				kind: { type: Type.STRING, enum: ['arc', 'elbow'] },
				dash: { type: Type.STRING, enum: ['draw', 'solid', 'dashed', 'dotted'] },
				arrowheadStart: { type: Type.STRING, enum: ['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar'] },
				arrowheadEnd: { type: Type.STRING, enum: ['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar'] },
			},
		},
	},
	{
		name: 'create_flowchart',
		description: 'Create an auto-laid-out flowchart or diagram with editable shapes and bound connectors.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				title: { type: Type.STRING },
				frameName: { type: Type.STRING },
				direction: { type: Type.STRING, enum: ['vertical', 'horizontal'] },
				arrowKind: { type: Type.STRING, enum: ['arc', 'elbow'] },
				nodes: {
					type: Type.ARRAY,
					items: {
						type: Type.OBJECT,
						properties: {
							refId: { type: Type.STRING },
							label: { type: Type.STRING },
							shape: { type: Type.STRING, enum: ['rectangle', 'oval', 'ellipse', 'diamond', 'cloud', 'hexagon', 'note'] },
							color: { type: Type.STRING, enum: COLOR_VALUES },
							fill: { type: Type.STRING, enum: FILL_VALUES },
						},
						required: ['refId', 'label'],
					},
				},
				edges: {
					type: Type.ARRAY,
					items: {
						type: Type.OBJECT,
						properties: {
							from: { type: Type.STRING },
							to: { type: Type.STRING },
							label: { type: Type.STRING },
							color: { type: Type.STRING, enum: COLOR_VALUES },
						},
						required: ['from', 'to'],
					},
				},
			},
			required: ['nodes'],
		},
	},
	{
		name: 'create_mermaid_diagram',
		description: 'Import or render a Mermaid diagram onto the canvas.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				code: { type: Type.STRING },
				mode: { type: Type.STRING, enum: ['auto', 'editable', 'svg'] },
				title: { type: Type.STRING },
			},
			required: ['code'],
		},
	},
	{
		name: 'create_kanban_board',
		description: 'Create a multi-column Kanban board with column frames and draggable sticky-note cards.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				title: { type: Type.STRING },
				columns: {
					type: Type.ARRAY,
					items: {
						type: Type.OBJECT,
						properties: {
							name: { type: Type.STRING },
							color: { type: Type.STRING, enum: COLOR_VALUES },
							cards: {
								type: Type.ARRAY,
								items: {
									type: Type.OBJECT,
									properties: {
										text: { type: Type.STRING },
										color: { type: Type.STRING, enum: COLOR_VALUES },
									},
									required: ['text'],
								},
							},
						},
						required: ['name', 'cards'],
					},
				},
			},
			required: ['columns'],
		},
	},
	{
		name: 'add_kanban_card',
		description: 'Add a task card into an existing Kanban column frame.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				column: { type: Type.STRING },
				text: { type: Type.STRING },
				color: { type: Type.STRING, enum: COLOR_VALUES },
			},
			required: ['column', 'text'],
		},
	},
	{
		name: 'create_document',
		description: 'Create an interactive editable document card on the canvas.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				title: { type: Type.STRING },
				markdown: { type: Type.STRING },
				w: { type: Type.NUMBER },
				h: { type: Type.NUMBER },
			},
			required: ['title', 'markdown'],
		},
	},
	{
		name: 'update_document',
		description: 'Update the title and/or body of an existing document shape.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeId: { type: Type.STRING },
				useSelected: { type: Type.BOOLEAN },
				title: { type: Type.STRING },
				markdown: { type: Type.STRING },
			},
		},
	},
	{
		name: 'create_embed',
		description: 'Embed a URL (YouTube, Figma, CodePen, etc.) onto the canvas.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				url: { type: Type.STRING },
				w: { type: Type.NUMBER },
				h: { type: Type.NUMBER },
			},
			required: ['url'],
		},
	},
	{
		name: 'update_shape',
		description: 'Update text, color, fill, geo, size, dimensions, or position of shapes.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				text: { type: Type.STRING },
				color: { type: Type.STRING, enum: COLOR_VALUES },
				fill: { type: Type.STRING, enum: FILL_VALUES },
				geo: { type: Type.STRING, enum: GEO_VALUES },
				size: { type: Type.STRING, enum: SIZE_VALUES },
				x: { type: Type.NUMBER },
				y: { type: Type.NUMBER },
				w: { type: Type.NUMBER },
				h: { type: Type.NUMBER },
			},
		},
	},
	{
		name: 'move_shapes',
		description: 'Move shapes by (dx, dy).',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				dx: { type: Type.NUMBER },
				dy: { type: Type.NUMBER },
			},
			required: ['dx', 'dy'],
		},
	},
	{
		name: 'delete_shapes',
		description: 'Delete specific or selected shapes.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
			},
		},
	},
	{
		name: 'arrange_shapes',
		description: 'Align, distribute, or lay out shapes in a row, column, or grid.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				operation: {
					type: Type.STRING,
					enum: [
						'align-left',
						'align-center-horizontal',
						'align-right',
						'align-top',
						'align-center-vertical',
						'align-bottom',
						'distribute-horizontal',
						'distribute-vertical',
						'grid',
						'row',
						'column',
					],
				},
				gap: { type: Type.NUMBER },
			},
			required: ['operation'],
		},
	},
	{
		name: 'manage_shapes',
		description: 'Group, ungroup, toggle-lock, duplicate, bring-to-front, or send-to-back.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				action: {
					type: Type.STRING,
					enum: ['group', 'ungroup', 'toggle-lock', 'duplicate', 'bring-to-front', 'send-to-back'],
				},
			},
			required: ['action'],
		},
	},
	{
		name: 'manage_page',
		description: 'Create, switch, or rename pages.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				action: { type: Type.STRING, enum: ['create', 'switch', 'rename'] },
				name: { type: Type.STRING },
				pageId: { type: Type.STRING },
			},
			required: ['action'],
		},
	},
	{
		name: 'select_and_focus',
		description: 'Select specific shapes and/or zoom camera to fit.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				fitAll: { type: Type.BOOLEAN },
			},
		},
	},
]

interface IncomingBody {
	message?: string
	model?: string
	history?: Array<{ role: string; text: string; actionsSummary?: string }>
	canvasContext?: {
		pageName?: string
		pages?: unknown
		editorState?: unknown
		viewport?: unknown
		totalShapeCount?: number
		selectedShapeIds?: string[]
		shapes?: unknown[]
		screenshotBase64?: string
	}
	continuations?: Array<{
		modelParts?: unknown[]
		toolResults?: Array<{
			id: string
			name: string
			ok: boolean
			summary: string
			createdIds?: Record<string, string>
			affectedIds?: string[]
			error?: string
		}>
	}>
}

function sanitizeErrorMessage(err: unknown): string {
	let raw = err instanceof Error ? err.message : String(err)
	for (let i = 0; i < 2; i++) {
		try {
			const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
			const nested = parsed?.error?.message ?? parsed?.message
			if (typeof nested === 'string' && nested.trim()) {
				raw = nested.trim()
			} else {
				break
			}
		} catch {
			break
		}
	}
	return raw.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED]')
}

function selectModel(requested?: string): string {
	if (requested && (SUPPORTED_GEMINI_MODELS as readonly string[]).includes(requested)) {
		return requested
	}
	return DEFAULT_GEMINI_MODEL
}

function buildContents(body: IncomingBody): Content[] {
	const contents: Content[] = []

	for (const turn of (body.history ?? []).slice(-20)) {
		const text = turn.actionsSummary
			? `${turn.text}\n\n[Executed canvas actions: ${turn.actionsSummary}]`
			: turn.text
		if (!text?.trim()) continue
		contents.push({
			role: turn.role === 'assistant' ? 'model' : 'user',
			parts: [{ text }],
		})
	}

	const ctx = body.canvasContext ?? {}
	const compactCtx = {
		pageName: ctx.pageName,
		pages: ctx.pages,
		editorState: ctx.editorState,
		viewport: ctx.viewport,
		totalShapeCount: ctx.totalShapeCount,
		selectedShapeIds: ctx.selectedShapeIds,
		shapes: ctx.shapes,
	}

	const currentUserParts: Part[] = [
		{
			text: `Current tldraw canvas state (live snapshot):\n\`\`\`json\n${JSON.stringify(compactCtx)}\n\`\`\`\n\nUser request:\n${body.message ?? ''}`,
		},
	]
	if (ctx.screenshotBase64) {
		currentUserParts.push({
			inlineData: { mimeType: 'image/png', data: ctx.screenshotBase64 },
		})
	}
	contents.push({ role: 'user', parts: currentUserParts })

	for (const cont of body.continuations ?? []) {
		if (Array.isArray(cont.modelParts) && cont.modelParts.length > 0) {
			contents.push({ role: 'model', parts: cont.modelParts as Part[] })
		}
		const responseParts: Part[] = (cont.toolResults ?? []).map((r) => ({
			functionResponse: {
				id: r.id,
				name: r.name,
				response: {
					ok: r.ok,
					summary: r.summary,
					...(r.createdIds ? { createdIds: r.createdIds } : {}),
					...(r.affectedIds ? { affectedIds: r.affectedIds } : {}),
					...(r.error ? { error: r.error } : {}),
				},
			},
		}))
		if (responseParts.length > 0) {
			contents.push({ role: 'user', parts: responseParts })
		}
	}

	return contents
}

export async function POST(request: Request): Promise<Response> {
	const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
	if (!apiKey) {
		return Response.json(
			{
				error:
					'GEMINI_API_KEY is not configured in the server environment. Add GEMINI_API_KEY to the app .env file and restart the app.',
			},
			{ status: 503 }
		)
	}

	let body: IncomingBody
	try {
		body = (await request.json()) as IncomingBody
	} catch (err) {
		return Response.json({ error: sanitizeErrorMessage(err) }, { status: 400 })
	}

	if (!body.message || !body.canvasContext) {
		return Response.json(
			{ error: 'Missing required fields: message and canvasContext.' },
			{ status: 400 }
		)
	}

	const requestedModel = selectModel(body.model)
	const fallbackOrder = [
		requestedModel,
		...SUPPORTED_GEMINI_MODELS.filter((m) => m !== requestedModel),
	]

	const encoder = new TextEncoder()
	const abortController = new AbortController()
	request.signal.addEventListener('abort', () => abortController.abort())

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const emit = (event: unknown) => {
				if (abortController.signal.aborted) return
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
				} catch {
					// Client closed connection
				}
			}

			try {
				const ai = new GoogleGenAI({ apiKey })
				const contents = buildContents(body)

				const collectedToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []
				const collectedModelParts: Part[] = []
				let textBuffer = ''
				let streamedAnyText = false
				let activeModel = requestedModel

				const flushTextBuffer = () => {
					if (textBuffer.length > 0) {
						collectedModelParts.push({ text: textBuffer })
						textBuffer = ''
					}
				}

				let lastErr: unknown = null
				let succeeded = false

				for (const candidateModel of fallbackOrder) {
					if (abortController.signal.aborted) break
					activeModel = candidateModel

					emit({
						type: 'status',
						phase: 'thinking',
						detail:
							candidateModel === requestedModel
								? `Asking ${candidateModel}…`
								: `${requestedModel} busy — falling back to ${candidateModel}…`,
					})

					try {
						const responseStream = await ai.models.generateContentStream({
							model: candidateModel,
							contents,
							config: {
								systemInstruction: AGENT_SYSTEM_INSTRUCTION,
								tools: [{ functionDeclarations: AGENT_TOOL_DECLARATIONS }],
								temperature: 0.4,
								abortSignal: abortController.signal,
							},
						})

						for await (const chunk of responseStream) {
							if (abortController.signal.aborted) break
							const parts = chunk.candidates?.[0]?.content?.parts
							if (parts && parts.length > 0) {
								for (const part of parts) {
									const isThought = Boolean((part as { thought?: boolean }).thought)
									if (part.functionCall) {
										flushTextBuffer()
										const callId = part.functionCall.id || crypto.randomUUID()
										collectedModelParts.push({
											...part,
											functionCall: { ...part.functionCall, id: callId },
										})
										collectedToolCalls.push({
											id: callId,
											name: part.functionCall.name ?? '',
											args: (part.functionCall.args ?? {}) as Record<string, unknown>,
										})
									} else if (typeof part.text === 'string' && part.text.length > 0) {
										if (isThought) continue
										if (!streamedAnyText) {
											streamedAnyText = true
											emit({ type: 'status', phase: 'streaming' })
										}
										textBuffer += part.text
										emit({ type: 'text', delta: part.text })
									}
								}
							} else if (chunk.text) {
								if (!streamedAnyText) {
									streamedAnyText = true
									emit({ type: 'status', phase: 'streaming' })
								}
								textBuffer += chunk.text
								emit({ type: 'text', delta: chunk.text })
							}
						}

						succeeded = true
						break
					} catch (err) {
						lastErr = err
						const msg = sanitizeErrorMessage(err)
						const isTransient =
							!streamedAnyText &&
							collectedToolCalls.length === 0 &&
							/high demand|503|unavailable|overloaded/i.test(msg)
						if (isTransient && !abortController.signal.aborted) continue
						throw err
					}
				}

				if (!succeeded && !abortController.signal.aborted && lastErr) {
					throw lastErr
				}

				flushTextBuffer()

				if (!abortController.signal.aborted) {
					if (collectedToolCalls.length > 0) {
						emit({
							type: 'tool_calls',
							calls: collectedToolCalls,
							modelParts: collectedModelParts,
						})
					}
					emit({ type: 'done', model: activeModel })
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					emit({ type: 'error', message: sanitizeErrorMessage(err) })
				}
			} finally {
				try {
					controller.close()
				} catch {
					// Already closed
				}
			}
		},
		cancel() {
			abortController.abort()
		},
	})

	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	})
}
