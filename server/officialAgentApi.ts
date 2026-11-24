import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentPrompt } from '../src/shared/types/AgentPrompt.ts'
import { AgentService } from './officialAgent/AgentService.ts'
import { getAgentEnvironment, hasAnyAgentProvider } from './officialAgent/environment.ts'
import { readJsonBody, sendJson, writeSseEvent } from './httpUtils.ts'

function sanitize(value: unknown): string {
	const raw = value instanceof Error ? value.message : String(value)
	return raw
		.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED]')
		.replace(
			/Stop and restart this Codespace \(or add GEMINI_API_KEY in Vercel Environment Variables\)\./g,
			'Check the server AI provider configuration.'
		)
		.replace(
			/Stop and restart this Codespace to load your secret\./g,
			'Check the server AI provider configuration.'
		)
		.replace(
			/Stop and restart this Codespace \(or add GEMINI_API_KEY in Vercel Environment Variables\)/g,
			'Check the server AI provider configuration'
		)
		.replace(/Stop and restart this Codespace to load your secret/g, 'Check the server AI provider configuration')
		.replace(/Stop and restart this Codespace/g, 'Check the server AI provider configuration')
		.replace(/Vercel Environment Variables/g, 'server environment variables')
}

export async function handleOfficialAgentStream(req: IncomingMessage, res: ServerResponse) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}

	const env = getAgentEnvironment()
	if (!hasAnyAgentProvider(env)) {
		sendJson(res, 503, {
			error:
				'No AI provider key is available in the server environment. Set GOOGLE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.',
		})
		return
	}

	let prompt: AgentPrompt
	try {
		prompt = await readJsonBody<AgentPrompt>(req)
	} catch (error) {
		sendJson(res, 400, { error: sanitize(error) })
		return
	}

	if (!prompt || !prompt.mode) {
		sendJson(res, 400, { error: 'Missing required agent prompt fields.' })
		return
	}

	const controller = new AbortController()
	res.on('close', () => {
		if (!res.writableEnded) controller.abort()
	})

	res.statusCode = 200
	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
	res.setHeader('Cache-Control', 'no-cache, no-transform')
	res.setHeader('Connection', 'keep-alive')
	res.setHeader('X-Accel-Buffering', 'no')
	res.flushHeaders?.()

	const finish = { toolCalls: 0 }
	try {
		const service = new AgentService(env)
		for await (const action of service.stream(prompt, finish, controller.signal)) {
			if (controller.signal.aborted) break
			writeSseEvent(res, action)
		}
		if (!controller.signal.aborted) {
			writeSseEvent(res, { toolCalls: finish.toolCalls })
		}
	} catch (error) {
		if (!controller.signal.aborted) {
			writeSseEvent(res, { error: sanitize(error) })
		}
	} finally {
		if (!res.writableEnded) res.end()
	}
}
