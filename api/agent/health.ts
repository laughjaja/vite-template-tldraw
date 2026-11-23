import { getHealthPayload } from '../../server/geminiCore.ts'

export function GET(): Response {
	return new Response(JSON.stringify(getHealthPayload()), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	})
}
