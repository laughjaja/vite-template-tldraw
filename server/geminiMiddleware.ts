import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import type { AgentChatRequest, AgentStreamEvent } from '../shared/agentTypes.ts'
import {
	getHealthPayload,
	resolveServerApiKey,
	runGeminiStream,
	sanitizeErrorMessage,
} from './geminiCore.ts'

const MAX_BODY_BYTES = 12 * 1024 * 1024

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

async function handleHealth(_req: IncomingMessage, res: ServerResponse) {
	sendJson(res, 200, getHealthPayload())
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
				'GEMINI_API_KEY is not available in the server environment. Add GEMINI_API_KEY to the app .env file and restart the app.',
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

	const abortController = new AbortController()
	res.on('close', () => {
		if (!res.writableEnded) {
			abortController.abort()
		}
	})

	res.statusCode = 200
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
	res.setHeader('Cache-Control', 'no-cache, no-transform')
	res.setHeader('Connection', 'keep-alive')
	res.setHeader('X-Accel-Buffering', 'no')
	res.flushHeaders?.()

	try {
		await runGeminiStream({
			apiKey,
			body,
			signal: abortController.signal,
			emit: (event) => writeSseEvent(res, event),
		})
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

export function registerLegacyAgentRoutes(middlewares: Connect.Server) {
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
			registerLegacyAgentRoutes(server.middlewares)
		},
		configurePreviewServer(server) {
			registerLegacyAgentRoutes(server.middlewares)
		},
	}
}
