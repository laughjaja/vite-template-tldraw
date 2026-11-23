import mammoth from 'mammoth'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { Box, createShapeId, type Editor, type TLShapeId } from 'tldraw'
import type { DocumentShape } from './DocumentShapeUtil'

export function sanitizeDocumentHtml(rawHtml: string): string {
	const parser = new DOMParser()
	const doc = parser.parseFromString(rawHtml, 'text/html')

	// Remove active / unsafe elements
	const forbidden = doc.querySelectorAll('script, style, iframe, object, embed, link, meta')
	forbidden.forEach((el) => el.remove())

	// Strip inline event handlers and javascript: URLs
	const all = doc.body.querySelectorAll('*')
	all.forEach((el) => {
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase()
			const val = attr.value.trim().toLowerCase()
			if (name.startsWith('on') || val.startsWith('javascript:')) {
				el.removeAttribute(attr.name)
			}
		}
	})

	return doc.body.innerHTML.trim() || '<p></p>'
}

export function htmlToPlaintext(html: string): string {
	if (!html) return ''
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, 'text/html')
	return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export function markdownToHtml(md: string): string {
	const lines = md.replace(/\r\n/g, '\n').split('\n')
	const out: string[] = []
	let inUl = false
	let inOl = false
	let inCode = false
	let codeLines: string[] = []

	const closeLists = () => {
		if (inUl) {
			out.push('</ul>')
			inUl = false
		}
		if (inOl) {
			out.push('</ol>')
			inOl = false
		}
	}

	const formatInline = (text: string) =>
		escapeHtml(text)
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\*([^*]+)\*/g, '<em>$1</em>')

	for (const line of lines) {
		if (line.trim().startsWith('```')) {
			if (inCode) {
				out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
				codeLines = []
				inCode = false
			} else {
				closeLists()
				inCode = true
			}
			continue
		}
		if (inCode) {
			codeLines.push(line)
			continue
		}

		const trimmed = line.trim()
		if (!trimmed) {
			closeLists()
			continue
		}

		const h3 = trimmed.match(/^###\s+(.+)/)
		const h2 = trimmed.match(/^##\s+(.+)/)
		const h1 = trimmed.match(/^#\s+(.+)/)
		const ul = trimmed.match(/^[-*+]\s+(.+)/)
		const ol = trimmed.match(/^\d+\.\s+(.+)/)
		const bq = trimmed.match(/^>\s+(.+)/)

		if (h1) {
			closeLists()
			out.push(`<h1>${formatInline(h1[1])}</h1>`)
		} else if (h2) {
			closeLists()
			out.push(`<h2>${formatInline(h2[1])}</h2>`)
		} else if (h3) {
			closeLists()
			out.push(`<h3>${formatInline(h3[1])}</h3>`)
		} else if (ul) {
			if (inOl) {
				out.push('</ol>')
				inOl = false
			}
			if (!inUl) {
				out.push('<ul>')
				inUl = true
			}
			out.push(`<li>${formatInline(ul[1])}</li>`)
		} else if (ol) {
			if (inUl) {
				out.push('</ul>')
				inUl = false
			}
			if (!inOl) {
				out.push('<ol>')
				inOl = true
			}
			out.push(`<li>${formatInline(ol[1])}</li>`)
		} else if (bq) {
			closeLists()
			out.push(`<blockquote>${formatInline(bq[1])}</blockquote>`)
		} else {
			closeLists()
			out.push(`<p>${formatInline(trimmed)}</p>`)
		}
	}

	closeLists()
	if (inCode && codeLines.length > 0) {
		out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
	}

	return out.join('\n') || '<p></p>'
}

export function htmlToMarkdown(html: string): string {
	const parser = new DOMParser()
	const doc = parser.parseFromString(html, 'text/html')

	const walk = (node: Node): string => {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent ?? ''
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return ''
		const el = node as HTMLElement
		const tag = el.tagName.toLowerCase()
		const inner = Array.from(el.childNodes).map(walk).join('')

		switch (tag) {
			case 'h1':
				return `# ${inner.trim()}\n\n`
			case 'h2':
				return `## ${inner.trim()}\n\n`
			case 'h3':
				return `### ${inner.trim()}\n\n`
			case 'p':
			case 'div':
				return inner.trim() ? `${inner.trim()}\n\n` : ''
			case 'br':
				return '\n'
			case 'strong':
			case 'b':
				return `**${inner}**`
			case 'em':
			case 'i':
				return `*${inner}*`
			case 'code':
				return el.parentElement?.tagName.toLowerCase() === 'pre' ? inner : `\`${inner}\``
			case 'pre':
				return `\`\`\`\n${inner.trim()}\n\`\`\`\n\n`
			case 'blockquote':
				return `> ${inner.trim()}\n\n`
			case 'ul':
				return `${Array.from(el.children)
					.map((li) => `- ${walk(li).trim()}`)
					.join('\n')}\n\n`
			case 'ol':
				return `${Array.from(el.children)
					.map((li, i) => `${i + 1}. ${walk(li).trim()}`)
					.join('\n')}\n\n`
			case 'li':
				return inner
			default:
				return inner
		}
	}

	return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim()
}

export async function parseUploadedDocument(file: File): Promise<{
	title: string
	html: string
	sourceFormat: string
}> {
	const lower = file.name.toLowerCase()
	const baseTitle = file.name.replace(/\.[^.]+$/, '') || 'Untitled Document'

	if (lower.endsWith('.docx')) {
		const arrayBuffer = await file.arrayBuffer()
		const result = await mammoth.convertToHtml({ arrayBuffer })
		return {
			title: baseTitle,
			html: sanitizeDocumentHtml(result.value),
			sourceFormat: 'DOCX',
		}
	}

	const text = await file.text()

	if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
		return {
			title: baseTitle,
			html: sanitizeDocumentHtml(markdownToHtml(text)),
			sourceFormat: 'MD',
		}
	}

	if (lower.endsWith('.html') || lower.endsWith('.htm')) {
		return {
			title: baseTitle,
			html: sanitizeDocumentHtml(text),
			sourceFormat: 'HTML',
		}
	}

	if (lower.endsWith('.json') || lower.endsWith('.csv')) {
		return {
			title: baseTitle,
			html: `<pre><code>${escapeHtml(text)}</code></pre>`,
			sourceFormat: lower.endsWith('.json') ? 'JSON' : 'CSV',
		}
	}

	// Default plain text
	const paragraphs = text
		.replace(/\r\n/g, '\n')
		.split(/\n{2,}/)
		.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
		.join('\n')

	return {
		title: baseTitle,
		html: paragraphs || '<p></p>',
		sourceFormat: 'TXT',
	}
}

export function insertDocumentOnCanvas(
	editor: Editor,
	opts: {
		title: string
		html: string
		sourceFormat?: string
		w?: number
		h?: number
		enterEditMode?: boolean
	}
): TLShapeId {
	const w = Math.max(360, opts.w ?? 640)
	const h = Math.max(280, opts.h ?? 520)
	const vp = editor.getViewportPageBounds()
	const x = Math.round(vp.x + vp.w / 2 - w / 2)
	const y = Math.round(vp.y + vp.h / 2 - h / 2)
	const id = createShapeId()

	editor.markHistoryStoppingPoint('create-document')
	editor.run(() => {
		editor.createShape<DocumentShape>({
			id,
			type: 'document',
			x,
			y,
			props: {
				w,
				h,
				title: opts.title.trim() || 'Untitled Document',
				html: sanitizeDocumentHtml(opts.html),
				sourceFormat: opts.sourceFormat ?? 'DOC',
			},
		})
		editor.select(id)
	})

	editor.zoomToBounds(new Box(x - 40, y - 40, w + 80, h + 80), {
		animation: { duration: 320 },
		inset: 60,
	})

	if (opts.enterEditMode) {
		editor.setEditingShape(id)
	}

	return id
}

function triggerDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

export function exportDocumentAsHtml(title: string, html: string) {
	const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #111827; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; }
  blockquote { border-left: 3px solid #2563eb; margin: 12px 0; padding-left: 14px; color: #4b5563; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${html}
</body>
</html>`
	triggerDownload(new Blob([full], { type: 'text/html;charset=utf-8' }), `${title || 'document'}.html`)
}

export function exportDocumentAsMarkdown(title: string, html: string) {
	const md = `# ${title}\n\n${htmlToMarkdown(html)}\n`
	triggerDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${title || 'document'}.md`)
}

export function exportDocumentAsText(title: string, html: string) {
	const txt = `${title}\n${'='.repeat(Math.max(4, title.length))}\n\n${htmlToPlaintext(html)}\n`
	triggerDownload(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `${title || 'document'}.txt`)
}

export async function exportDocumentAsPdf(title: string, html: string) {
	const pdfDoc = await PDFDocument.create()
	const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
	const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

	const pageW = 612
	const pageH = 792
	const margin = 48
	const maxWidth = pageW - margin * 2

	let page = pdfDoc.addPage([pageW, pageH])
	let y = pageH - margin

	// Title
	page.drawText(title || 'Untitled Document', {
		x: margin,
		y,
		size: 18,
		font: bold,
		color: rgb(0.07, 0.1, 0.16),
	})
	y -= 30

	const plain = htmlToPlaintext(html)
	const paragraphs = plain.split('\n')
	const fontSize = 11
	const lineHeight = 16

	for (const para of paragraphs) {
		const words = para.split(/\s+/).filter(Boolean)
		if (words.length === 0) {
			y -= lineHeight * 0.6
			continue
		}

		let currentLine = ''
		for (const word of words) {
			const candidate = currentLine ? `${currentLine} ${word}` : word
			// Strip non-WinAnsi glyphs safely so pdf-lib standard font never throws
			const safeCandidate = candidate.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
			const width = regular.widthOfTextAtSize(safeCandidate, fontSize)
			if (width > maxWidth && currentLine) {
				if (y < margin + lineHeight) {
					page = pdfDoc.addPage([pageW, pageH])
					y = pageH - margin
				}
				page.drawText(currentLine.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), {
					x: margin,
					y,
					size: fontSize,
					font: regular,
					color: rgb(0.15, 0.15, 0.2),
				})
				y -= lineHeight
				currentLine = word
			} else {
				currentLine = candidate
			}
		}

		if (currentLine) {
			if (y < margin + lineHeight) {
				page = pdfDoc.addPage([pageW, pageH])
				y = pageH - margin
			}
			page.drawText(currentLine.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'), {
				x: margin,
				y,
				size: fontSize,
				font: regular,
				color: rgb(0.15, 0.15, 0.2),
			})
			y -= lineHeight * 1.15
		}
	}

	const bytes = await pdfDoc.save()
	triggerDownload(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), `${title || 'document'}.pdf`)
}

export const SAMPLE_DOCUMENT = {
	title: 'Product Architecture Brief',
	sourceFormat: 'DOC',
	html: `<h2>Overview</h2>
<p>This live document lives directly on your <strong>tldraw infinite canvas</strong>. Double-click or click <em>Edit</em> above to modify text, apply formatting, connect arrows to other shapes, or ask Gemini to summarize or expand it.</p>
<h2>Key Goals</h2>
<ul>
  <li>Upload Word (<code>.docx</code>), Markdown (<code>.md</code>), HTML, or text files directly onto the board.</li>
  <li>Edit rich text in place without leaving the whiteboard.</li>
  <li>Export edited documents back to <strong>Markdown</strong>, <strong>HTML</strong>, <strong>TXT</strong>, or <strong>PDF</strong>.</li>
</ul>
<blockquote>Tip: Select this document and ask Gemini in the right sidebar to turn it into a flowchart or Kanban board!</blockquote>`,
}
