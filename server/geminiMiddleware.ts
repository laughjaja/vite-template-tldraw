import crypto from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { GoogleGenAI, type Content, type Part } from '@google/genai'
import type { Connect, Plugin } from 'vite'
import type {
	AgentChatRequest,
	AgentHealthResponse,
	AgentStreamEvent,
	AgentToolCall,
	AgentToolName,
	CanvasContextSnapshot,
} from '../shared/agentTypes'
import {
	AGENT_SYSTEM_INSTRUCTION,
	AGENT_TOOL_DECLARATIONS,
	DEFAULT_GEMINI_MODEL,
	SUPPORTED_GEMINI_MODELS,
} from './agentTools.ts'

const MAX_BODY_BYTES = 12 * 1024 * 1024

function resolveServerApiKey(): string | undefined {
	// Support the user's Codespaces secret GEMINI_API_KEY (and map GOOGLE_API_KEY fallback if set).
	// Never log, expose, or serialize this value.
	const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
	return key && key.length > 0 ? key : undefined
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
	res.statusCode = statusCode
	res.setHeader('Content-Type', 'application/json; charset=utf-8')
	res.end(JSON.stringify(payload))
}

function writeSseEvent(res: ServerResponse, event: AgentStreamEvent) {
	if (res.writableEnded || res.destroyed) return
	res.write(`data: ${JSON.stringify(event)}\n\n`)
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
	const chunks: Buffer[] = []
	let totalBytes = 0

	for await (const chunk of req) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		totalBytes += buf.byteLength
		if (totalBytes > MAX_BODY_BYTES) {
			throw new Error('Request payload exceeds limit.')
		}
		chunks.push(buf)
	}

	const raw = Buffer.concat(chunks).toString('utf-8')
	if (!raw) {
		throw new Error('Empty request body.')
	}
	return JSON.parse(raw) as T
}

function formatCanvasContextPrompt(context: CanvasContextSnapshot): string {
	const compactContext = {
		pageName: context.pageName,
		viewport: context.viewport,
		totalShapeCount: context.totalShapeCount,
		selectedShapeIds: context.selectedShapeIds,
		shapes: context.shapes,
	}

	return [
		'Current tldraw canvas state (live snapshot):',
		'```json',
		JSON.stringify(compactContext),
		'```',
	].join('\n')
}

function buildGeminiContents(body: AgentChatRequest): Content[] {
	const contents: Content[] = []

	// Include prior session conversation turns (up to last 20 messages)
	const recentHistory = (body.history ?? []).slice(-20)
	for (const turn of recentHistory) {
		const text = turn.actionsSummary
			? `${turn.text}\n\n[Executed canvas actions: ${turn.actionsSummary}]`
			: turn.text
		if (!text.trim()) continue
		contents.push({
			role: turn.role === 'assistant' ? 'model' : 'user',
			parts: [{ text }],
		})
	}

	// Build current user turn with live canvas context + optional screenshot + user prompt
	const currentUserParts: Part[] = [
		{
			text: `${formatCanvasContextPrompt(body.canvasContext)}\n\nUser request:\n${body.message}`,
		},
	]

	if (body.canvasContext.screenshotBase64) {
		currentUserParts.push({
			inlineData: {
				mimeType: 'image/png',
				data: body.canvasContext.screenshotBase64,
			},
		})
	}

	contents.push({
		role: 'user',
		parts: currentUserParts,
	})

	// Append any executed tool-call continuation rounds so Gemini receives real execution results
	for (const continuation of body.continuations ?? []) {
		if (Array.isArray(continuation.modelParts) && continuation.modelParts.length > 0) {
			contents.push({
				role: 'model',
				parts: continuation.modelParts as Part[],
			})
		}

		const responseParts: Part[] = continuation.toolResults.map((result) => ({
			functionResponse: {
				id: result.id,
				name: result.name,
				response: {
					ok: result.ok,
					summary: result.summary,
					...(result.createdIds ? { createdIds: result.createdIds } : {}),
					...(result.affectedIds ? { affectedIds: result.affectedIds } : {}),
					...(result.error ? { error: result.error } : {}),
				},
			},
		}))

		if (responseParts.length > 0) {
			contents.push({
				role: 'user',
				parts: responseParts,
			})
		}
	}

	return contents
}

function selectModel(requested?: string): string {
	if (requested && (SUPPORTED_GEMINI_MODELS as readonly string[]).includes(requested)) {
		return requested
	}
	return DEFAULT_GEMINI_MODEL
}

function sanitizeErrorMessage(err: unknown): string {
	let raw = err instanceof Error ? err.message : String(err)
	// Unwrap nested JSON error messages returned by the Gemini API
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
	// Never risk echoing any key-like strings in error messages
	return raw.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED]')
}

async function handleHealth(_req: IncomingMessage, res: ServerResponse) {
	const apiKey = resolveServerApiKey()
	const payload: AgentHealthResponse = {
		ok: Boolean(apiKey),
		apiKeyConfigured: Boolean(apiKey),
		model: DEFAULT_GEMINI_MODEL,
		availableModels: [...SUPPORTED_GEMINI_MODELS],
		message: apiKey
			? 'Connected to Gemini API server endpoint'
			: 'GEMINI_API_KEY is not set in the server environment. If you recently added it on GitHub, stop and restart this Codespace.',
	}
	sendJson(res, 200, payload)
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}

	const apiKey = resolveServerApiKey()
	if (!apiKey) {
		sendJson(res, 503, {
			error:
				'GEMINI_API_KEY is not available in the server environment. Stop and restart this Codespace to load your GitHub secret.',
		})
		return
	}

	let body: AgentChatRequest
	try {
		body = await readJsonBody<AgentChatRequest>(req)
	} catch (err) {
		sendJson(res, 400, { error: sanitizeErrorMessage(err) })
		return
	}

	if (!body.message || !body.canvasContext) {
		sendJson(res, 400, { error: 'Missing required fields: message and canvasContext.' })
		return
	}

	const requestedModel = selectModel(body.model)
	const fallbackOrder = [
		requestedModel,
		...SUPPORTED_GEMINI_MODELS.filter((m) => m !== requestedModel),
	]
	const abortController = new AbortController()
	res.on('close', () => {
		if (!res.writableEnded) {
			abortController.abort()
		}
	})

	// Begin Server-Sent Events stream
	res.statusCode = 200
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
	res.setHeader('Cache-Control', 'no-cache, no-transform')
	res.setHeader('Connection', 'keep-alive')
	res.setHeader('X-Accel-Buffering', 'no')
	res.flushHeaders?.()

	try {
		const ai = new GoogleGenAI({ apiKey })
		const contents = buildGeminiContents(body)

		const collectedToolCalls: AgentToolCall[] = []
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

			writeSseEvent(res, {
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
					if (abortController.signal.aborted) {
						break
					}

					const parts = chunk.candidates?.[0]?.content?.parts
					if (parts && parts.length > 0) {
						for (const part of parts) {
							const isThought = Boolean((part as { thought?: boolean }).thought)
							if (part.functionCall) {
								flushTextBuffer()
								const callId = part.functionCall.id || crypto.randomUUID()
								// Preserve raw part (including any thoughtSignature) for multi-turn functionResponse
								collectedModelParts.push({
									...part,
									functionCall: {
										...part.functionCall,
										id: callId,
									},
								})
								collectedToolCalls.push({
									id: callId,
									name: part.functionCall.name as AgentToolName,
									args: (part.functionCall.args ?? {}) as Record<string, unknown>,
								})
							} else if (typeof part.text === 'string' && part.text.length > 0) {
								if (isThought) {
									continue
								}
								if (!streamedAnyText) {
									streamedAnyText = true
									writeSseEvent(res, { type: 'status', phase: 'streaming' })
								}
								textBuffer += part.text
								writeSseEvent(res, { type: 'text', delta: part.text })
							}
						}
					} else if (chunk.text) {
						if (!streamedAnyText) {
							streamedAnyText = true
							writeSseEvent(res, { type: 'status', phase: 'streaming' })
						}
						textBuffer += chunk.text
						writeSseEvent(res, { type: 'text', delta: chunk.text })
					}
				}

				succeeded = true
				break
			} catch (err) {
				lastErr = err
				const msg = sanitizeErrorMessage(err)
				const isTransientOverload =
					!streamedAnyText &&
					collectedToolCalls.length === 0 &&
					/high demand|503|unavailable|overloaded/i.test(msg)
				if (isTransientOverload && !abortController.signal.aborted) {
					continue
				}
				throw err
			}
		}

		if (!succeeded && !abortController.signal.aborted && lastErr) {
			throw lastErr
		}

		flushTextBuffer()

		if (!abortController.signal.aborted) {
			if (collectedToolCalls.length > 0) {
				writeSseEvent(res, {
					type: 'tool_calls',
					calls: collectedToolCalls,
					modelParts: collectedModelParts,
				})
			}
			writeSseEvent(res, { type: 'done', model: activeModel })
		}
	} catch (err) {
		if (!abortController.signal.aborted) {
			writeSseEvent(res, {
				type: 'error',
				message: sanitizeErrorMessage(err),
			})
		}
	} finally {
		if (!res.writableEnded) {
			res.end()
		}
	}
}

function attachMiddleware(middlewares: Connect.Server) {
	middlewares.use('/api/agent/health', (req, res) => {
		void handleHealth(req, res)
	})

	middlewares.use('/api/agent/chat', (req, res) => {
		void handleChat(req, res)
	})
}

export function geminiAgentPlugin(): Plugin {
	return {
		name: 'gemini-tldraw-agent-api',
		configureServer(server) {
			attachMiddleware(server.middlewares)
		},
		configurePreviewServer(server) {
			attachMiddleware(server.middlewares)
		},
	}
}
