import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { GoogleGenAI } from '@google/genai'
import { DEFAULT_GEMINI_MODEL } from './agentTools.ts'

export function resolveGeminiApiKey(): string | undefined {
	const key = (
		process.env.GEMINI_API_KEY ??
		process.env.GOOGLE_API_KEY ??
		process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
		''
	).trim()
	return key || undefined
}

export function getGeminiModelName(requested?: string): string {
	return requested?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

export function getGeminiModel(requested?: string) {
	const apiKey = resolveGeminiApiKey()
	if (!apiKey) throw new Error('GEMINI_API_KEY is not available in the server environment.')
	return createGoogleGenerativeAI({ apiKey })(getGeminiModelName(requested))
}

export function getGeminiClient(): GoogleGenAI {
	const apiKey = resolveGeminiApiKey()
	if (!apiKey) throw new Error('GEMINI_API_KEY is not available in the server environment.')
	return new GoogleGenAI({ apiKey })
}
