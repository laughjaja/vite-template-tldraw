import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
	AssetRecordType,
	Box,
	createShapeId,
	type Editor,
	type TLImageAsset,
	type TLImageShape,
	type TLShapeId,
} from 'tldraw'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PdfPageRecord {
	shapeId: TLShapeId
	pageIndex: number
	x: number
	y: number
	w: number
	h: number
	pdfWidth: number
	pdfHeight: number
}

export interface PdfDocumentSession {
	name: string
	sourceBytes: Uint8Array
	pages: PdfPageRecord[]
}

export async function createSamplePdfBytes(): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create()
	const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
	const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)

	// Page 1: Architecture Spec Review
	const p1 = pdfDoc.addPage([612, 792])
	p1.drawRectangle({ x: 0, y: 710, width: 612, height: 82, color: rgb(0.11, 0.16, 0.28) })
	p1.drawText('Project Proposal & Review Document', {
		x: 42,
		y: 744,
		size: 20,
		font: bold,
		color: rgb(1, 1, 1),
	})
	p1.drawText('Page 1 of 2 — Annotate with Draw, Highlighter, Arrows, Notes & Comments', {
		x: 42,
		y: 676,
		size: 11,
		font: regular,
		color: rgb(0.35, 0.4, 0.5),
	})
	p1.drawText('1. Executive Summary', { x: 42, y: 632, size: 15, font: bold, color: rgb(0.1, 0.1, 0.15) })
	p1.drawText(
		'This sample PDF lets you test freehand pen markup, text callouts, highlights, and real PDF export.',
		{ x: 42, y: 606, size: 11.5, font: regular, color: rgb(0.2, 0.2, 0.25) }
	)
	p1.drawRectangle({
		x: 42,
		y: 430,
		width: 528,
		height: 140,
		borderColor: rgb(0.75, 0.8, 0.88),
		borderWidth: 1.5,
		color: rgb(0.97, 0.98, 1),
	})
	p1.drawText('Review Checklist (Circle or Check Items):', {
		x: 60,
		y: 540,
		size: 13,
		font: bold,
		color: rgb(0.15, 0.25, 0.55),
	})
	const checklist = [
		'[ ] Confirm system architecture & API contracts',
		'[ ] Highlight any blocking risks in orange or red',
		'[ ] Add reviewer sign-off signature at the bottom',
	]
	checklist.forEach((line, i) => {
		p1.drawText(line, { x: 64, y: 508 - i * 28, size: 11.5, font: regular, color: rgb(0.15, 0.15, 0.2) })
	})
	p1.drawLine({
		start: { x: 42, y: 120 },
		end: { x: 300, y: 120 },
		thickness: 1,
		color: rgb(0.4, 0.4, 0.4),
	})
	p1.drawText('Reviewer Signature / Date', { x: 42, y: 100, size: 10, font: regular, color: rgb(0.4, 0.4, 0.45) })

	// Page 2: Notes & Diagram Space
	const p2 = pdfDoc.addPage([612, 792])
	p2.drawText('2. Technical Diagram & Feedback Notes (Page 2 of 2)', {
		x: 42,
		y: 734,
		size: 16,
		font: bold,
		color: rgb(0.1, 0.1, 0.15),
	})
	p2.drawRectangle({
		x: 42,
		y: 120,
		width: 528,
		height: 580,
		borderColor: rgb(0.8, 0.83, 0.88),
		borderWidth: 1.5,
	})
	p2.drawText('Sketch diagrams, drop sticky notes, or ask Gemini to annotate this page.', {
		x: 64,
		y: 668,
		size: 11.5,
		font: regular,
		color: rgb(0.4, 0.45, 0.52),
	})

	return pdfDoc.save()
}

export async function loadPdfOnCanvas(
	editor: Editor,
	input: { name: string; bytes: Uint8Array },
	onProgress?: (label: string) => void
): Promise<PdfDocumentSession> {
	// Keep a fresh copy of the raw PDF bytes for later pdf-lib export (pdfjs may transfer its buffer)
	const preservedBytes = new Uint8Array(input.bytes)
	const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(input.bytes) })
	const pdf = await loadingTask.promise

	const pageGap = 36
	const vp = editor.getViewportPageBounds()
	const startX = Math.round(vp.x + vp.w / 2 - 360)
	let cursorY = Math.round(vp.y + 40)

	const assets: TLImageAsset[] = []
	const shapesToCreate: Array<{
		id: TLShapeId
		pageIndex: number
		x: number
		y: number
		w: number
		h: number
		pdfWidth: number
		pdfHeight: number
		assetId: TLImageAsset['id']
	}> = []

	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		onProgress?.(`Rendering page ${pageNum} of ${pdf.numPages}…`)
		const page = await pdf.getPage(pageNum)
		const baseViewport = page.getViewport({ scale: 1 })
		const renderScale = 2
		const scaledViewport = page.getViewport({ scale: renderScale })

		const canvas = document.createElement('canvas')
		canvas.width = Math.round(scaledViewport.width)
		canvas.height = Math.round(scaledViewport.height)
		const ctx = canvas.getContext('2d')
		if (!ctx) throw new Error('Canvas 2D context unavailable')

		await page.render({
			canvas,
			canvasContext: ctx,
			viewport: scaledViewport,
		}).promise

		const dataUrl = canvas.toDataURL('image/png')
		const displayW = Math.round(baseViewport.width * 1.15)
		const displayH = Math.round(baseViewport.height * 1.15)
		const assetId = AssetRecordType.createId()
		const shapeId = createShapeId()

		assets.push({
			id: assetId,
			typeName: 'asset',
			type: 'image',
			props: {
				w: displayW,
				h: displayH,
				name: `${input.name}-page-${pageNum}.png`,
				isAnimated: false,
				mimeType: 'image/png',
				src: dataUrl,
			},
			meta: {},
		})

		shapesToCreate.push({
			id: shapeId,
			pageIndex: pageNum - 1,
			x: startX,
			y: cursorY,
			w: displayW,
			h: displayH,
			pdfWidth: baseViewport.width,
			pdfHeight: baseViewport.height,
			assetId,
		})

		cursorY += displayH + pageGap
	}

	editor.markHistoryStoppingPoint('load-pdf-pages')
	editor.run(() => {
		editor.createAssets(assets)
		for (const p of shapesToCreate) {
			editor.createShape<TLImageShape>({
				id: p.id,
				type: 'image',
				x: p.x,
				y: p.y,
				isLocked: true,
				props: {
					w: p.w,
					h: p.h,
					assetId: p.assetId,
					altText: `${input.name} — Page ${p.pageIndex + 1}`,
				},
				meta: {
					role: 'pdf-page',
					pdfName: input.name,
					pageIndex: p.pageIndex,
				},
			})
		}
		editor.sendToBack(shapesToCreate.map((p) => p.id))
	})

	// Focus first page and activate pen tool for immediate markup
	editor.updateInstanceState({ isReadonly: false })
	editor.setCurrentTool('draw')
	if (shapesToCreate[0]) {
		const first = shapesToCreate[0]
		editor.zoomToBounds(new Box(first.x - 40, first.y - 30, first.w + 80, first.h + 60), {
			animation: { duration: 350 },
			inset: 40,
		})
	}

	return {
		name: input.name,
		sourceBytes: preservedBytes,
		pages: shapesToCreate.map((p) => ({
			shapeId: p.id,
			pageIndex: p.pageIndex,
			x: p.x,
			y: p.y,
			w: p.w,
			h: p.h,
			pdfWidth: p.pdfWidth,
			pdfHeight: p.pdfHeight,
		})),
	}
}

export async function exportAnnotatedPdf(
	editor: Editor,
	session: PdfDocumentSession,
	onProgress?: (label: string) => void
): Promise<void> {
	const pdfDoc = await PDFDocument.load(session.sourceBytes)
	const pdfPages = pdfDoc.getPages()
	const pageShapeIdSet = new Set<string>(session.pages.map((p) => p.shapeId))
	const allShapes = editor.getCurrentPageShapes()

	for (const pageRec of session.pages) {
		onProgress?.(`Exporting annotations for page ${pageRec.pageIndex + 1} of ${session.pages.length}…`)
		const pageBounds = editor.getShapePageBounds(pageRec.shapeId)
		const targetPdfPage = pdfPages[pageRec.pageIndex]
		if (!pageBounds || !targetPdfPage) continue

		// Collect all user annotations intersecting this PDF page (excluding locked PDF page backgrounds)
		const annotationIds = allShapes
			.filter((s) => {
				if (pageShapeIdSet.has(s.id)) return false
				const b = editor.getShapePageBounds(s.id)
				return b ? b.collides(pageBounds) : false
			})
			.map((s) => s.id)

		if (annotationIds.length === 0) continue

		const { blob } = await editor.toImage(annotationIds, {
			bounds: pageBounds,
			format: 'png',
			background: false,
			padding: 0,
			scale: 2,
		})
		const pngBytes = new Uint8Array(await blob.arrayBuffer())
		const embeddedPng = await pdfDoc.embedPng(pngBytes)

		targetPdfPage.drawImage(embeddedPng, {
			x: 0,
			y: 0,
			width: targetPdfPage.getWidth(),
			height: targetPdfPage.getHeight(),
		})
	}

	const finalBytes = await pdfDoc.save()
	const safeCopy = new Uint8Array(finalBytes)
	const blob = new Blob([safeCopy], { type: 'application/pdf' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	const baseName = session.name.replace(/\.pdf$/i, '')
	a.href = url
	a.download = `${baseName}-annotated.pdf`
	a.click()
	URL.revokeObjectURL(url)
}
