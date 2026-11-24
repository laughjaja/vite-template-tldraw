import type { Env } from './env'
import { json } from './auth'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function objectKey(name: string): string | null {
	return /^[a-zA-Z0-9_.-]{1,200}$/.test(name) ? `uploads/${name}` : null
}

export async function handleAsset(request: Request, env: Env, name: string): Promise<Response> {
	const key = objectKey(name)
	if (!key) return json({ error: 'Invalid asset name.' }, 400)
	if (request.method === 'PUT') {
		const contentType = request.headers.get('Content-Type')?.split(';')[0]?.toLowerCase() ?? ''
		if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) return json({ error: 'Only images and video assets are supported.' }, 415)
		const length = Number(request.headers.get('Content-Length'))
		if (!Number.isSafeInteger(length) || length <= 0) return json({ error: 'Content-Length is required.' }, 411)
		if (length > MAX_UPLOAD_BYTES) return json({ error: 'Assets must be 50 MB or smaller.' }, 413)
		if (!request.body) return json({ error: 'Asset body is required.' }, 400)
		if (await env.TLDRAW_BUCKET.head(key)) return json({ error: 'Asset already exists.' }, 409)
		const uploaded = await env.TLDRAW_BUCKET.put(key, request.body, { httpMetadata: { contentType }, onlyIf: { etagDoesNotMatch: '*' } })
		if (!uploaded) return json({ error: 'Asset already exists.' }, 409)
		return json({ ok: true })
	}
	if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, HEAD, PUT' })
	const object = await env.TLDRAW_BUCKET.get(key, { range: request.headers, onlyIf: request.headers })
	if (!object) return json({ error: 'Asset not found.' }, 404)
	const headers = new Headers()
	object.writeHttpMetadata(headers)
	// Every read must pass session authentication, even when an asset was fetched previously.
	headers.set('Cache-Control', 'private, no-store')
	headers.set('ETag', object.httpEtag)
	headers.set('X-Content-Type-Options', 'nosniff')
	headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
	headers.set('Accept-Ranges', 'bytes')
	if (!('body' in object)) return new Response(null, { status: 304, headers })
	let status = 200
	if (request.headers.has('Range') && object.range) {
		const start = 'suffix' in object.range ? Math.max(0, object.size - object.range.suffix) : object.range.offset ?? 0
		const end = 'length' in object.range && object.range.length ? start + object.range.length - 1 : object.size - 1
		headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`)
		status = 206
	}
	return new Response(request.method === 'HEAD' ? null : object.body, { status, headers })
}
