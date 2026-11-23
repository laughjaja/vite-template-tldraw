import {
	resolveServerApiKey,
	runGeminiStream,
	sanitizeErrorMessage,
} from '../../server/geminiCore.ts'
import type { AgentChatRequest, AgentStreamEvent } from '../../shared/agentTypes.ts'

export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
	const apiKey = resolveServerApiKey()
	if (!apiKey) {
		return new Response(
			JSON.stringify({
				error:
					'GEMINI_API_KEY is not configured in Vercel Environment Variables. Add GEMINI_API_KEY and redeploy.',
			}),
			{
				status: 503,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			}
		)
	}

	let body: AgentChatRequest
	try {
		body = (await request.json()) as AgentChatRequest
	} catch (err) {
		return new Response(JSON.stringify({ error: sanitizeErrorMessage(err) }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		})
	}

	if (!body.message || !body.canvasContext) {
		return new Response(
			JSON.stringify({ error: 'Missing required fields: message and canvasContext.' }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			}
		)
	}

	const encoder = new TextEncoder()
	const abortController = new AbortController()
	request.signal.addEventListener('abort', () => abortController.abort())

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const emit = (event: AgentStreamEvent) => {
				if (abortController.signal.aborted) return
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
				} catch {
					// Stream closed by client
				}
			}

			try {
				await runGeminiStream({
					apiKey,
					body,
					signal: abortController.signal,
					emit,
				})
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
