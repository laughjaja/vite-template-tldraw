import type { Plugin } from 'vite'

const SERVER_ENV_KEYS = [
	'GEMINI_API_KEY',
	'GOOGLE_API_KEY',
	'GOOGLE_GENERATIVE_AI_API_KEY',
	'OPENAI_API_KEY',
	'ANTHROPIC_API_KEY',
	'OPENROUTER_API_KEY',
	'AI_MODEL',
	'TLDRAW_DATA_DIR',
]

function applyServerEnv(env: Record<string, string>) {
	for (const key of SERVER_ENV_KEYS) {
		const value = env[key]?.trim()
		if (value && !process.env[key]) process.env[key] = value
	}
}

export function nativeApiPlugin(env: Record<string, string>): Plugin {
	applyServerEnv(env)
	return {
		name: 'jastldraw-native-api',
		async configureServer(server) {
			const { attachNativeApi } = await server.ssrLoadModule('/server/nativeApiMiddleware.ts')
			attachNativeApi(server.middlewares)
		},
	}
}
