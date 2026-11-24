import type { IncomingMessage, ServerResponse } from 'node:http'
import { getGeminiClient, getGeminiModelName } from './aiProvider.ts'
import { readJsonBody, sendJson } from './httpUtils.ts'

interface WorkflowAiRequest {
	nodeType?: string
	input?: Record<string, unknown>
}

export async function handleWorkflowAi(req: IncomingMessage, res: ServerResponse) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}

	let body: WorkflowAiRequest
	try {
		body = await readJsonBody<WorkflowAiRequest>(req)
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
		return
	}
	if (!body.nodeType) {
		sendJson(res, 400, { error: 'nodeType is required.' })
		return
	}

	const prompt = [
		'You are one step in a visual workflow running inside a tldraw canvas.',
		`Node type: ${body.nodeType}`,
		`Input values: ${JSON.stringify(body.input ?? {})}`,
		'Return only JSON in the form {"result": <number>} where result is a finite number.',
	].join('\n')

	try {
		const response = await getGeminiClient().models.generateContent({
			model: getGeminiModelName(),
			contents: prompt,
			config: {
				temperature: 0,
				maxOutputTokens: 1024,
				responseMimeType: 'application/json',
			},
		})
		const parsed = JSON.parse(String(response.text ?? '{}')) as { result?: unknown }
		if (typeof parsed.result !== 'number' || !Number.isFinite(parsed.result)) {
			sendJson(res, 502, { error: 'The workflow AI step must return a finite numeric result.' })
			return
		}
		sendJson(res, 200, { result: parsed.result })
	} catch (error) {
		sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
	}
}
