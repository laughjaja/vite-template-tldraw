import crypto from 'node:crypto'
import { GoogleGenAI, type Content, type Part } from '@google/genai'
import type {
	AgentChatRequest,
	AgentHealthResponse,
	AgentStreamEvent,
	AgentToolCall,
	AgentToolName,
	CanvasContextSnapshot,
} from '../shared/agentTypes.ts'
import {
	AGENT_SYSTEM_INSTRUCTION,
	AGENT_TOOL_DECLARATIONS,
	DEFAULT_GEMINI_MODEL,
	SUPPORTED_GEMINI_MODELS,
} from './agentTools.ts'

export function resolveServerApiKey(): string | undefined {
	const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
	return key && key.length > 0 ? key : undefined
}

export function getHealthPayload(): AgentHealthResponse {
	const apiKey = resolveServerApiKey()
	return {
		ok: Boolean(apiKey),
		apiKeyConfigured: Boolean(apiKey),
		model: DEFAULT_GEMINI_MODEL,
		availableModels: [...SUPPORTED_GEMINI_MODELS],
		message: apiKey
			? 'Connected to Gemini API server endpoint'
			: 'GEMINI_API_KEY is not set in the server environment. Add GEMINI_API_KEY in Codespaces Secrets or Vercel Environment Variables.',
	}
}

export function selectModel(requested?: string): string {
	if (requested && (SUPPORTED_GEMINI_MODELS as readonly string[]).includes(requested)) {
		return requested
	}
	return DEFAULT_GEMINI_MODEL
}

export function sanitizeErrorMessage(err: unknown): string {
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

function formatCanvasContextPrompt(context: CanvasContextSnapshot): string {
	const compactContext = {
		pageName: context.pageName,
		pages: context.pages,
		editorState: context.editorState,
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

export function buildGeminiContents(body: AgentChatRequest): Content[] {
	const contents: Content[] = []

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

export async function runGeminiStream(opts: {
	apiKey: string
	body: AgentChatRequest
	signal: AbortSignal
	emit: (event: AgentStreamEvent) => void
}): Promise<void> {
	const { apiKey, body, signal, emit } = opts
	const requestedModel = selectModel(body.model)
	const fallbackOrder = [
		requestedModel,
		...SUPPORTED_GEMINI_MODELS.filter((m) => m !== requestedModel),
	]

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
		if (signal.aborted) break
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
					abortSignal: signal,
				},
			})

			for await (const chunk of responseStream) {
				if (signal.aborted) break

				const parts = chunk.candidates?.[0]?.content?.parts
				if (parts && parts.length > 0) {
					for (const part of parts) {
						const isThought = Boolean((part as { thought?: boolean }).thought)
						if (part.functionCall) {
							flushTextBuffer()
							const callId = part.functionCall.id || crypto.randomUUID()
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
			const isTransientOverload =
				!streamedAnyText &&
				collectedToolCalls.length === 0 &&
				/high demand|503|unavailable|overloaded/i.test(msg)
			if (isTransientOverload && !signal.aborted) {
				continue
			}
			throw err
		}
	}

	if (!succeeded && !signal.aborted && lastErr) {
		throw lastErr
	}

	flushTextBuffer()

	if (!signal.aborted) {
		if (collectedToolCalls.length > 0) {
			emit({
				type: 'tool_calls',
				calls: collectedToolCalls,
				modelParts: collectedModelParts,
			})
		}
		emit({ type: 'done', model: activeModel })
	}
}
