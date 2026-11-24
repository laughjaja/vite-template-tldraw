import type { Env } from './env'

const COOKIE_NAME = 'jastldraw_session'
const SESSION_SECONDS = 24 * 60 * 60
const encoder = new TextEncoder()

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
	const responseHeaders = new Headers(headers)
	responseHeaders.set('Content-Type', 'application/json')
	responseHeaders.set('Cache-Control', 'no-store')
	return new Response(JSON.stringify(data), { status, headers: responseHeaders })
}

function bytesToHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string): Uint8Array | null {
	if (!/^[0-9a-f]{64}$/.test(value)) return null
	return new Uint8Array(value.match(/../g)!.map((pair) => Number.parseInt(pair, 16)))
}

async function signingKey(password: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(`jastldraw-session-v1:${password}`),
		{ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function passwordMatches(actual: string, expected: string): Promise<boolean> {
	const key = await signingKey(expected)
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(expected))
	return crypto.subtle.verify('HMAC', key, signature, encoder.encode(actual))
}

function cookieOptions(request: Request): string {
	return `Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}

export function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get('Origin')
	return !origin || origin === new URL(request.url).origin
}

export async function isAuthenticated(request: Request, env: Pick<Env, 'WORKSPACE_PASSWORD'>): Promise<boolean> {
	if (!env.WORKSPACE_PASSWORD) return false
	const cookie = request.headers.get('Cookie')?.split(';').map((part) => part.trim())
		.find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1)
	if (!cookie) return false
	const [version, expiry, nonce, signature, extra] = cookie.split('.')
	if (version !== 'v1' || extra || !/^\d{10}$/.test(expiry ?? '') || !/^[a-f0-9]{32}$/.test(nonce ?? '')) return false
	const expiresAt = Number(expiry)
	const now = Math.floor(Date.now() / 1000)
	if (expiresAt <= now || expiresAt > now + SESSION_SECONDS + 60) return false
	const signatureBytes = hexToBytes(signature ?? '')
	if (!signatureBytes) return false
	return crypto.subtle.verify('HMAC', await signingKey(env.WORKSPACE_PASSWORD), signatureBytes,
		encoder.encode(`${version}.${expiry}.${nonce}`))
}

export async function handleSession(request: Request, env: Env): Promise<Response> {
	if (!env.WORKSPACE_PASSWORD) {
		return json({ authenticated: false, error: 'Private workspace is not configured. Set WORKSPACE_PASSWORD on the Worker.' }, 503)
	}
	if (request.method === 'GET') return json({ authenticated: await isAuthenticated(request, env) })
	if (!isSameOrigin(request)) return json({ authenticated: false, error: 'Origin not allowed.' }, 403)
	if (request.method === 'DELETE') {
		return json({ authenticated: false }, 200, { 'Set-Cookie': `${COOKIE_NAME}=; Max-Age=0; ${cookieOptions(request)}` })
	}
	if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' })
	if (Number(request.headers.get('Content-Length') ?? '0') > 4096) return json({ error: 'Login request is too large.' }, 413)
	let body: unknown
	try {
		const text = await request.text()
		if (text.length > 4096) return json({ error: 'Login request is too large.' }, 413)
		body = JSON.parse(text)
	} catch {
		return json({ authenticated: false, error: 'Enter a password.' }, 400)
	}
	if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string') {
		return json({ authenticated: false, error: 'Enter a password.' }, 400)
	}
	const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
	const ipHash = bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(ip)))
	const limiter = env.AUTH_RATE_LIMITER.get(env.AUTH_RATE_LIMITER.idFromName(ipHash))
	const limitResponse = await limiter.fetch('https://internal/attempt', { method: 'POST' })
	if (limitResponse.status === 429) return json({ authenticated: false, error: 'Too many login attempts. Try again in one minute.' }, 429, { 'Retry-After': '60' })
	if (!limitResponse.ok) return json({ authenticated: false, error: 'Login unavailable.' }, 503)
	if (!(await passwordMatches(body.password, env.WORKSPACE_PASSWORD))) {
		return json({ authenticated: false, error: 'Incorrect password.' }, 401)
	}
	const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS
	const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
	const payload = `v1.${expiresAt}.${nonce}`
	const signature = bytesToHex(await crypto.subtle.sign('HMAC', await signingKey(env.WORKSPACE_PASSWORD), encoder.encode(payload)))
	return json({ authenticated: true }, 200, {
		'Set-Cookie': `${COOKIE_NAME}=${payload}.${signature}; Max-Age=${SESSION_SECONDS}; ${cookieOptions(request)}`,
	})
}
