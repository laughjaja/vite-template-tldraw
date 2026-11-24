const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash'
const SUPPORTED_GEMINI_MODELS = [
	'gemini-3.6-flash',
	'gemini-3.5-flash',
	'gemini-3.5-flash-lite',
	'gemini-3.8-flash',
]

export function GET(): Response {
	const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
	const apiKeyConfigured = Boolean(key && key.length > 0)

	return Response.json(
		{
			ok: apiKeyConfigured,
			apiKeyConfigured,
			model: DEFAULT_GEMINI_MODEL,
			availableModels: SUPPORTED_GEMINI_MODELS,
			message: apiKeyConfigured
				? 'Connected to Gemini API server endpoint'
				: 'GEMINI_API_KEY is not configured in the server environment. Add GEMINI_API_KEY to the app .env file and restart the app.',
		},
		{
			status: 200,
			headers: {
				'Cache-Control': 'no-store',
			},
		}
	)
}
