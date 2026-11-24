import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const distDir = path.resolve(rootDir, 'dist')
const port = Number(process.env.PORT ?? 4173)
const host = process.env.HOST ?? '127.0.0.1'

type LoadEnvFile = (filename: string) => void
const loadEnvFile = (process as unknown as { loadEnvFile?: LoadEnvFile }).loadEnvFile

if (loadEnvFile) {
	for (const filename of ['.env.production.local', '.env.local', '.env.production', '.env']) {
		const filePath = path.resolve(process.env.JASTLDRAW_ENV_DIR || rootDir, filename)
		if (existsSync(filePath)) loadEnvFile(filePath)
	}
}

if (!existsSync(distDir)) {
	throw new Error('Production build is missing. Run npm run build first.')
}

const { attachNativeApi } = await import('./nativeApiMiddleware.ts')

type ApiNext = (error?: unknown) => void
type ApiHandler = (req: IncomingMessage, res: ServerResponse, next: ApiNext) => void
type ApiLayer = { prefix?: string; handler: ApiHandler }

const apiLayers: ApiLayer[] = []
const middlewares = {
	use(prefixOrHandler: string | ApiHandler, maybeHandler?: ApiHandler) {
		if (typeof prefixOrHandler === 'string' && maybeHandler) {
			apiLayers.push({ prefix: prefixOrHandler, handler: maybeHandler })
		} else if (typeof prefixOrHandler === 'function') {
			apiLayers.push({ handler: prefixOrHandler })
		}
	},
} as unknown as Parameters<typeof attachNativeApi>[0]

attachNativeApi(middlewares)

const mimeTypes: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.pdf': 'application/pdf',
	'.wasm': 'application/wasm',
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
	res.statusCode = statusCode
	res.setHeader('Content-Type', 'application/json; charset=utf-8')
	res.end(JSON.stringify(payload))
}

function runApi(req: IncomingMessage, res: ServerResponse) {
	const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
	let index = 0
	const next: ApiNext = (error) => {
		if (error) {
			if (!res.headersSent) sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
			else res.end()
			return
		}
		const layer = apiLayers[index++]
		if (!layer) {
			sendJson(res, 404, { error: 'Not found.' })
			return
		}
		if (layer.prefix && pathname !== layer.prefix && !pathname.startsWith(`${layer.prefix}/`)) {
			next()
			return
		}
		try {
			layer.handler(req, res, next)
		} catch (handlerError) {
			next(handlerError)
		}
	}
	next()
}

function sendFile(filePath: string, res: ServerResponse, method?: string) {
	const ext = path.extname(filePath).toLowerCase()
	res.statusCode = 200
	res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream')
	res.setHeader('X-Content-Type-Options', 'nosniff')
	if (method === 'HEAD') {
		res.end()
		return
	}
	const stream = createReadStream(filePath)
	stream.on('error', () => {
		if (!res.headersSent) sendJson(res, 500, { error: 'Could not read file.' })
		else res.end()
	})
	stream.pipe(res)
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		sendJson(res, 405, { error: 'Method not allowed.' })
		return
	}
	let pathname: string
	try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname) }
	catch { sendJson(res, 400, { error: 'Invalid URL.' }); return }
	if (pathname.split('/').some((part) => part.startsWith('.'))) {
		sendJson(res, 404, { error: 'Not found.' })
		return
	}
	const requested = path.resolve(distDir, `.${pathname}`)
	if (requested !== distDir && !requested.startsWith(`${distDir}${path.sep}`)) {
		sendJson(res, 403, { error: 'Forbidden.' })
		return
	}

	let filePath = requested
	try {
		if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html')
	} catch {
		sendJson(res, 500, { error: 'Could not inspect file.' })
		return
	}

	if (existsSync(filePath) && statSync(filePath).isFile()) {
		sendFile(filePath, res, req.method)
		return
	}

	if (path.extname(pathname)) {
		sendJson(res, 404, { error: 'Not found.' })
		return
	}

	sendFile(path.join(distDir, 'index.html'), res, req.method)
}

const server = createServer((req, res) => {
	const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
	if (pathname.startsWith('/api/') || pathname === '/stream') {
		runApi(req, res)
		return
	}
	serveStatic(req, res)
})

server.listen(port, host, () => {
	console.log(`jastldraw production server listening on http://${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		server.close(() => process.exit(0))
		setTimeout(() => { server.closeAllConnections(); process.exit(0) }, 5000).unref()
	})
}
