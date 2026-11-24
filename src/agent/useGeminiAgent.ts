import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import type {
	AgentChatRequest,
	AgentContinuation,
	AgentHealthResponse,
	AgentStreamEvent,
	AgentToolCall,
	AgentToolResult,
	ChatTurnMessage,
} from '../../shared/agentTypes'
import { collectCanvasContext } from './context'
import { executeCanvasActions } from './executeActions'

export type ConnectionState = 'checking' | 'connected' | 'missing_key' | 'error'

export interface ChatMessage {
	id: string
	role: 'user' | 'assistant'
	text: string
	actions: AgentToolResult[]
	status: 'streaming' | 'acting' | 'complete' | 'stopped' | 'error'
	error?: string
	timestamp: number
}

const MAX_TOOL_ROUNDS = 4

function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function readSseStream(
	response: Response,
	onEvent: (event: AgentStreamEvent) => void,
	signal: AbortSignal
): Promise<void> {
	const body = response.body
	if (!body) {
		throw new Error('Server did not return a readable stream.')
	}

	const reader = body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''

	try {
		while (!signal.aborted) {
			const { value, done } = await reader.read()
			if (done) break

			buffer += decoder.decode(value, { stream: true })
			const frames = buffer.split('\n\n')
			buffer = frames.pop() ?? ''

			for (const frame of frames) {
				const dataLines = frame
					.split('\n')
					.filter((line) => line.startsWith('data:'))
					.map((line) => line.slice(5).trimStart())
				if (dataLines.length === 0) continue

				const rawJson = dataLines.join('\n')
				try {
					const parsed = JSON.parse(rawJson) as AgentStreamEvent
					onEvent(parsed)
				} catch {
					// Ignore malformed keepalive or partial frames
				}
			}
		}
	} finally {
		reader.releaseLock()
	}
}

export function useGeminiAgent(editor: Editor | null) {
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [connectionState, setConnectionState] = useState<ConnectionState>('checking')
	const [connectionMessage, setConnectionMessage] = useState<string>('Checking Gemini connection…')
	const [model, setModel] = useState<string>('gemini-3.6-flash')
	const [availableModels, setAvailableModels] = useState<string[]>(['gemini-3.6-flash'])
	const [includeScreenshot, setIncludeScreenshot] = useState<boolean>(true)
	const [isGenerating, setIsGenerating] = useState<boolean>(false)
	const [isModifyingCanvas, setIsModifyingCanvas] = useState<boolean>(false)
	const [activePhase, setActivePhase] = useState<string>('')
	const [globalError, setGlobalError] = useState<string | null>(null)
	const [canvasStats, setCanvasStats] = useState<{ shapes: number; selected: number }>({
		shapes: 0,
		selected: 0,
	})

	const abortControllerRef = useRef<AbortController | null>(null)
	const messagesRef = useRef<ChatMessage[]>(messages)
	messagesRef.current = messages

	// Check server health & GEMINI_API_KEY availability on mount
	const checkHealth = useCallback(async () => {
		setConnectionState('checking')
		try {
			const res = await fetch('/api/agent/health')
			if (!res.ok) {
				setConnectionState('error')
				setConnectionMessage(`Server returned HTTP ${res.status}`)
				return
			}
			const data = (await res.json()) as AgentHealthResponse
			if (data.availableModels?.length > 0) {
				setAvailableModels(data.availableModels)
			}
			if (data.model) {
				setModel((prev) =>
					data.availableModels?.includes(prev) ? prev : data.model
				)
			}
			if (data.apiKeyConfigured) {
				setConnectionState('connected')
				setConnectionMessage(data.message ?? 'Connected')
			} else {
				setConnectionState('missing_key')
				setConnectionMessage(
					data.message ??
						'GEMINI_API_KEY is missing. Add GEMINI_API_KEY to the app .env file and restart the app.'
				)
			}
		} catch (err) {
			setConnectionState('error')
			setConnectionMessage(
				err instanceof Error ? `Connection error: ${err.message}` : 'Unable to reach server'
			)
		}
	}, [])

	useEffect(() => {
		void checkHealth()
	}, [checkHealth])

	// Keep live shape & selection counts synced with the tldraw editor
	useEffect(() => {
		if (!editor) return

		const syncStats = () => {
			setCanvasStats({
				shapes: editor.getCurrentPageShapes().length,
				selected: editor.getSelectedShapeIds().length,
			})
		}

		syncStats()
		const unsubscribe = editor.store.listen(syncStats, {
			scope: 'all',
		})
		return () => unsubscribe()
	}, [editor])

	const stopGeneration = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort()
			abortControllerRef.current = null
		}
	}, [])

	const clearHistory = useCallback(() => {
		stopGeneration()
		setMessages([])
		setGlobalError(null)
		setIsGenerating(false)
		setIsModifyingCanvas(false)
		setActivePhase('')
	}, [stopGeneration])

	const sendMessage = useCallback(
		async (rawText: string) => {
			const trimmed = rawText.trim()
			if (!trimmed || isGenerating) return
			if (!editor) {
				setGlobalError('Canvas editor is still initializing. Please try again in a moment.')
				return
			}

			setGlobalError(null)

			const historyForRequest: ChatTurnMessage[] = messagesRef.current
				.filter((m) => m.status !== 'error')
				.map((m) => ({
					role: m.role,
					text: m.text,
					...(m.actions.length > 0
						? { actionsSummary: m.actions.map((a) => a.summary).join('; ') }
						: {}),
				}))

			const userMsg: ChatMessage = {
				id: makeId(),
				role: 'user',
				text: trimmed,
				actions: [],
				status: 'complete',
				timestamp: Date.now(),
			}

			const assistantMsgId = makeId()
			const initialAssistantMsg: ChatMessage = {
				id: assistantMsgId,
				role: 'assistant',
				text: '',
				actions: [],
				status: 'streaming',
				timestamp: Date.now(),
			}

			setMessages((prev) => [...prev, userMsg, initialAssistantMsg])
			setIsGenerating(true)
			setActivePhase('Reading canvas…')

			const controller = new AbortController()
			abortControllerRef.current = controller

			const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
				setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? updater(m) : m)))
			}

			try {
				const initialCanvasContext = await collectCanvasContext(editor, includeScreenshot)
				const continuations: AgentContinuation[] = []
				const turnRefMap = new Map<string, TLShapeId>()

				for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
					if (controller.signal.aborted) break

					setActivePhase(round === 0 ? `Thinking (${model})…` : 'Summarizing canvas updates…')

					const payload: AgentChatRequest = {
						message: trimmed,
						history: historyForRequest,
						canvasContext: initialCanvasContext,
						model,
						...(continuations.length > 0 ? { continuations } : {}),
					}

					const response = await fetch('/api/agent/chat', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload),
						signal: controller.signal,
					})

					if (!response.ok) {
						let serverError = `Request failed (HTTP ${response.status})`
						try {
							const errJson = (await response.json()) as { error?: string }
							if (errJson.error) serverError = errJson.error
						} catch {
							// Keep HTTP error fallback
						}
						throw new Error(serverError)
					}

					let pendingCalls: AgentToolCall[] = []
					let pendingModelParts: unknown[] = []
					let streamError: string | null = null

					await readSseStream(
						response,
						(event) => {
							if (event.type === 'status') {
								if (event.detail) setActivePhase(event.detail)
								else if (event.phase === 'streaming') setActivePhase('Streaming response…')
							} else if (event.type === 'text') {
								updateAssistant((m) => ({
									...m,
									text: m.text + event.delta,
									status: 'streaming',
								}))
							} else if (event.type === 'tool_calls') {
								pendingCalls = event.calls
								pendingModelParts = event.modelParts
							} else if (event.type === 'error') {
								streamError = event.message
							}
						},
						controller.signal
					)

					if (streamError) {
						throw new Error(streamError)
					}

					if (controller.signal.aborted) break

					if (pendingCalls.length === 0) {
						// No canvas actions left — turn is finished
						break
					}

					// Execute real tldraw canvas actions with clear UI indication
					setIsModifyingCanvas(true)
					setActivePhase(
						`Modifying canvas (${pendingCalls.length} action${pendingCalls.length === 1 ? '' : 's'})…`
					)
					updateAssistant((m) => ({ ...m, status: 'acting' }))

					const actionResults = await executeCanvasActions(editor, pendingCalls, turnRefMap)
					updateAssistant((m) => ({
						...m,
						actions: [...m.actions, ...actionResults],
					}))

					continuations.push({
						modelParts: pendingModelParts,
						toolResults: actionResults,
					})

					// Keep the canvas-modifying indicator visible briefly so users notice fast edits
					await new Promise((resolve) => setTimeout(resolve, 350))
					setIsModifyingCanvas(false)

					// Add a separator if Gemini already streamed preamble text before tool calls
					updateAssistant((m) => ({
						...m,
						text: m.text.trim() ? `${m.text.trimEnd()}\n\n` : m.text,
						status: 'streaming',
					}))
				}

				if (controller.signal.aborted) {
					updateAssistant((m) => ({
						...m,
						text:
							m.text ||
							(m.actions.length > 0
								? 'Generation stopped after applying canvas updates.'
								: 'Generation stopped.'),
						status: 'stopped',
					}))
				} else {
					updateAssistant((m) => ({
						...m,
						text:
							m.text.trim() ||
							(m.actions.length > 0
								? `Done: ${m.actions.map((a) => a.summary).join('. ')}.`
								: 'Done.'),
						status: 'complete',
					}))
				}
			} catch (err) {
				if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
					updateAssistant((m) => ({
						...m,
						text:
							m.text ||
							(m.actions.length > 0
								? 'Generation stopped after applying canvas updates.'
								: 'Generation stopped.'),
						status: 'stopped',
					}))
				} else {
					const message = err instanceof Error ? err.message : String(err)
					setGlobalError(message)
					updateAssistant((m) => ({
						...m,
						status: 'error',
						error: message,
					}))
				}
			} finally {
				abortControllerRef.current = null
				setIsGenerating(false)
				setIsModifyingCanvas(false)
				setActivePhase('')
			}
		},
		[editor, includeScreenshot, isGenerating, model]
	)

	return {
		messages,
		connectionState,
		connectionMessage,
		model,
		setModel,
		availableModels,
		includeScreenshot,
		setIncludeScreenshot,
		isGenerating,
		isModifyingCanvas,
		activePhase,
		globalError,
		canvasStats,
		sendMessage,
		stopGeneration,
		clearHistory,
		checkHealth,
	}
}
