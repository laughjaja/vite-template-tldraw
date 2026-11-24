import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

const MAX_BODY_BYTES = 12 * 1024 * 1024

export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = []
	let total = 0
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
		total += buffer.byteLength
		if (total > MAX_BODY_BYTES) throw new Error('Request payload exceeds limit.')
		chunks.push(buffer)
	}
	return Buffer.concat(chunks)
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
	const raw = await readRawBody(req)
	const text = raw.toString('utf-8')
	if (!text) throw new Error('Empty request body.')
	return JSON.parse(text) as T
}

export function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
	res.statusCode = statusCode
	res.setHeader('Content-Type', 'application/json; charset=utf-8')
	res.setHeader('Cache-Control', 'no-store')
	res.end(JSON.stringify(payload))
}

export function writeSseEvent(res: ServerResponse, event: unknown) {
	if (res.writableEnded || res.destroyed) return
	res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export async function pipeWebResponse(res: ServerResponse, response: Response) {
	res.statusCode = response.status
	response.headers.forEach((value, key) => {
		if (key !== 'content-length') res.setHeader(key, value)
	})
	if (!response.body) {
		res.end()
		return
	}
	await pipeline(Readable.fromWeb(response.body as never), res)
}

async function pipeline(stream: Readable, res: ServerResponse) {
	await new Promise<void>((resolve, reject) => {
		stream.on('error', reject)
		res.on('error', reject)
		res.on('close', resolve)
		stream.pipe(res)
	})
}
