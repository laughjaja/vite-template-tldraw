export interface Environment {
	OPENAI_API_KEY?: string
	ANTHROPIC_API_KEY?: string
	GOOGLE_API_KEY?: string
	OPENROUTER_API_KEY?: string
}

function clean(value: string | undefined): string | undefined {
	const trimmed = value?.trim()
	return trimmed ? trimmed : undefined
}

export function getAgentEnvironment(): Environment {
	return {
		OPENAI_API_KEY: clean(process.env.OPENAI_API_KEY),
		ANTHROPIC_API_KEY: clean(process.env.ANTHROPIC_API_KEY),
		GOOGLE_API_KEY:
			clean(process.env.GOOGLE_API_KEY) ??
			clean(process.env.GEMINI_API_KEY) ??
			clean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
		OPENROUTER_API_KEY: clean(process.env.OPENROUTER_API_KEY),
	}
}

export function hasAnyAgentProvider(env: Environment): boolean {
	return Boolean(
		env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GOOGLE_API_KEY || env.OPENROUTER_API_KEY
	)
}
