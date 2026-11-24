import type { Env } from './env'
import { handleSession, isAuthenticated, isSameOrigin, json } from './auth'
import { handleAsset } from './assets'

export { TldrawDurableObject } from './TldrawDurableObject'
export { AuthRateLimiter } from './AuthRateLimiter'

const ROOM_ID = 'jastldraw-default'
const AI_PARKED_MESSAGE = 'Gemini is parked during the Cloudflare migration. Canvas and sync remain available.'

export async function handleRequest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url)
	if (url.pathname === '/api/session') return handleSession(request, env)
	if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
	if (!env.WORKSPACE_PASSWORD) return json({ error: 'Private workspace is not configured.' }, 503)
	if (!isSameOrigin(request)) return json({ error: 'Origin not allowed.' }, 403)
	if (!(await isAuthenticated(request, env))) return json({ error: 'Sign in to access this workspace.' }, 401)
	if (url.pathname === `/api/connect/${ROOM_ID}`) {
		if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return json({ error: 'Expected a WebSocket upgrade.' }, 426)
		}
		return env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(ROOM_ID)).fetch(request)
	}
	const assetMatch = /^\/api\/uploads\/([^/]+)$/.exec(url.pathname)
	if (assetMatch) return handleAsset(request, env, assetMatch[1])
	if (url.pathname === '/api/agent/health') {
		return json({ ok: false, apiKeyConfigured: false, disabled: true, model: null, availableModels: [], message: AI_PARKED_MESSAGE })
	}
	if (url.pathname === '/api/agent/chat') return json({ error: AI_PARKED_MESSAGE }, 503)
	return json({ error: 'Endpoint not found.' }, 404)
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			return await handleRequest(request, env)
		} catch (error) {
			console.error('Worker request failed', error instanceof Error ? error.name : 'UnknownError')
			return json({ error: 'Workspace request failed. Please retry.' }, 500)
		}
	},
} satisfies ExportedHandler<Env>
