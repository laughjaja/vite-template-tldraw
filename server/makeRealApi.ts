import type { IncomingMessage, ServerResponse } from 'node:http'
import { getGeminiClient, getGeminiModelName, resolveGeminiApiKey } from './aiProvider.ts'
import { readJsonBody, sendJson } from './httpUtils.ts'

const MAKE_REAL_SYSTEM_PROMPT = `You are an expert web developer who specializes in building working website prototypes from low-fidelity wireframes. Your job is to accept low-fidelity designs and turn them into high-fidelity interactive and responsive working prototypes.

## Your task

When sent new designs, you should reply with a high-fidelity working prototype as a single HTML file.

## Important constraints

- Your ENTIRE PROTOTYPE needs to be included in a single HTML file.
- Your response MUST contain the entire HTML file contents.
- Put any JavaScript in a <script> tag with \`type="module"\`.
- Put any additional CSS in a <style> tag.
- Your prototype must be responsive.
- The HTML file should be self-contained and not reference any external resources except those listed below:
	- Use tailwind (via \`cdn.tailwindcss.com\`) for styling.
	- Use unpkg or skypack to import any required JavaScript dependencies.
	- Use Google fonts to pull in any open source fonts you require.
	- If you have any images, load them from Unsplash or use solid colored rectangles as placeholders.
	- Never create icons yourself, use an icon font or external library.

## Additional Instructions

The designs may include flow charts, diagrams, labels, arrows, sticky notes, screenshots of other applications, or even previous designs. Treat all of these as references for your prototype.

The designs may include structural elements (such as boxes that represent buttons or content) as well as annotations or figures that describe interactions, behavior, or appearance. Use your best judgement to determine what is an annotation and what should be included in the final result. Annotations are commonly made in the color red. Do NOT include any of those annotations in your final result.

If there are any questions or underspecified features, use what you know about applications, user experience, and website design patterns to "fill in the blanks". If you're unsure of how the designs should work, take a guess—it's better for you to get it wrong than to leave things incomplete.

Your prototype should look and feel much more complete and advanced than the wireframes provided. Flesh it out, make it real!

IMPORTANT LAST NOTES
- The last line of your response MUST be </html>
- The prototype must incorporate any annotations and feedback.
- Make it cool. You're a cool designer, your prototype should be an original work of creative genius.

Remember: you love your designers and want them to be happy. The more complete and impressive your prototype, the happier they will be. You are evaluated on 1) whether your prototype resembles the designs, 2) whether your prototype is interactive and responsive, and 3) whether your prototype is complete and impressive.`

const USER_PROMPT =
	'Here are the latest wireframes. Please reply with a high-fidelity working prototype as a single HTML file.'

const USER_PROMPT_WITH_PREVIOUS_DESIGN =
	"Here are the latest wireframes. There are also some previous outputs here. We have run their code through an 'HTML to screenshot' library to generate a screenshot of the page. The generated screenshot may have some inaccuracies so please use your knowledge of HTML and web development to figure out what any annotations are referring to, which may be different to what is visible in the generated screenshot. Make a new high-fidelity prototype based on your previous work and any new designs or annotations. Again, you should reply with a high-fidelity working prototype as a single HTML file."

interface MakeRealRequest {
	image?: string
	text?: string
	theme?: string
	previousPreviews?: string[]
	previousHtml?: string[]
}

export async function handleMakeReal(req: IncomingMessage, res: ServerResponse) {
	if (req.method !== 'POST') {
		sendJson(res, 405, { error: 'Method not allowed' })
		return
	}

	let body: MakeRealRequest
	try {
		body = await readJsonBody<MakeRealRequest>(req)
	} catch (error) {
		sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
		return
	}

	if (!body || typeof body !== 'object' || typeof body.image !== 'string') {
		sendJson(res, 400, { error: 'A base64 image is required.' })
		return
	}
	const previousPreviews = body.previousPreviews ?? body.previousHtml ?? []
	if (!Array.isArray(previousPreviews) || !previousPreviews.every((html) => typeof html === 'string') || (body.text !== undefined && typeof body.text !== 'string')) {
		sendJson(res, 400, { error: 'Invalid prototype context.' })
		return
	}

	const inlineData = dataUrlToInlineData(body.image ?? '')
	if (!inlineData) {
		sendJson(res, 400, { error: 'A base64 image is required.' })
		return
	}

	if (!resolveGeminiApiKey()) {
		sendJson(res, 503, { error: 'AI is unavailable. Configure a Gemini API key on the server to generate prototypes.' })
		return
	}

	const theme = body.theme === 'dark' ? 'dark' : 'light'
	const parts: { text?: string; inlineData?: typeof inlineData }[] = [
		{ text: previousPreviews.length ? USER_PROMPT_WITH_PREVIOUS_DESIGN : USER_PROMPT },
		{ inlineData },
	]

	if (body.text) {
		parts.push({ text: `Here's a list of text that we found in the design:\n${body.text}` })
	}

	for (const html of previousPreviews) {
		parts.push({
			text: `The designs also included one of your previous results. Here's the HTML you came up with for it:\n${html}`,
		})
	}

	parts.push({ text: `Please make your result use the ${theme} theme.` })

	try {
		const response = await getGeminiClient().models.generateContent({
			model: getGeminiModelName(),
			contents: [
				{
					role: 'user',
					parts,
				},
			],
			config: {
				systemInstruction: MAKE_REAL_SYSTEM_PROMPT,
				temperature: 0,
				maxOutputTokens: 8192,
			},
		})
		const html = extractHtml(String(response.text ?? ''))
		if (!html || html.length < 100) {
			sendJson(res, 502, { error: 'Could not generate a design from those wireframes.' })
			return
		}
		sendJson(res, 200, { html })
	} catch (error) {
		sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
	}
}

function dataUrlToInlineData(dataUrl: string) {
	const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl)
	if (!match) return undefined
	return { mimeType: match[1], data: match[2] }
}

function extractHtml(text: string): string | undefined {
	const start = text.search(/<!doctype html>/i)
	if (start === -1) return undefined
	const end = text.toLowerCase().indexOf('</html>', start)
	if (end === -1) return undefined
	return text.slice(start, end + '</html>'.length)
}
