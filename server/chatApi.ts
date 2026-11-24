import { convertToModelMessages, streamText, validateUIMessages, type UIMessage } from 'ai'
import { getGeminiClient, getGeminiModel, getGeminiModelName } from './aiProvider.ts'
import { pipeWebResponse, readJsonBody, readRawBody, sendJson } from './httpUtils.ts'

const CHAT_SYSTEM_PROMPT = [
	"You're a friendly AI chatbot.",
	'The user can send you images, sketches and diagrams from the tldraw canvas.',
	'You cannot create or edit the canvas yourself; a separate canvas agent does that.',
	'Answer the user directly and use markdown when useful.',
	'Keep your responses short and concise.',
].join(' ')

export async function handleChat(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}
	if (!resolveKey(res)) return

	let body: { messages?: UIMessage[] }
	try {
		body = await readJsonBody<{ messages?: UIMessage[] }>(req)
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
		return
	}
	if (!Array.isArray(body.messages) || body.messages.length === 0) {
		sendJson(res, 400, { error: 'Missing messages.' })
		return
	}

	let messages = body.messages
	try {
		messages = await validateUIMessages({ messages })
	} catch {
		sendJson(res, 400, { error: 'Invalid chat messages.' })
		return
	}

	try {
		const result = streamText({
			model: getGeminiModel(),
			system: CHAT_SYSTEM_PROMPT,
			messages: convertToModelMessages(messages),
		})
		await pipeWebResponse(res, result.toUIMessageStreamResponse())
	} catch (error) {
		sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
	}
}

export async function handleUpload(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}
	if (!resolveKey(res)) return

	const contentType = headerValue(req.headers['content-type'])
	const displayName = headerValue(req.headers['x-file-name'])
	if (!contentType) {
		sendJson(res, 400, { error: 'content-type is required.' })
		return
	}
	if (!displayName) {
		sendJson(res, 400, { error: 'x-file-name is required.' })
		return
	}

	try {
		const buffer = await readRawBody(req)
		const arrayBuffer = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength
		) as ArrayBuffer
		const file = await getGeminiClient().files.upload({
			file: new Blob([arrayBuffer], { type: contentType }),
			config: { mimeType: contentType, displayName },
		})
		sendJson(res, 200, { uploadedUrl: file.uri, expiresAt: file.expirationTime })
	} catch (error) {
		sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
	}
}

export function getChatHealth() {
	return { model: getGeminiModelName() }
}

function headerValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) return value[0]
	return value
}

function resolveKey(res: import('node:http').ServerResponse): boolean {
	if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
		return true
	}
	sendJson(res, 503, { error: 'GEMINI_API_KEY is not available in the server environment.' })
	return false
}
