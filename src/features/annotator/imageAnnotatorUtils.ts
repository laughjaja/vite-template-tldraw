import { uploadDataAsset } from '../cloud/uploadDataAsset'
import {
	AssetRecordType,
	Box,
	createShapeId,
	type Editor,
	type TLImageAsset,
	type TLImageShape,
	type TLShapeId,
} from 'tldraw'

export interface AnnotatedImageSession {
	shapeId: TLShapeId
	name: string
	width: number
	height: number
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(new Error('Failed to read image file'))
		reader.readAsDataURL(file)
	})
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			resolve({
				width: img.naturalWidth || img.width || 800,
				height: img.naturalHeight || img.height || 600,
			})
		}
		img.onerror = () => reject(new Error('Could not load image'))
		img.src = src
	})
}

export function createSampleAnnotationImageDataUrl(): string {
	const canvas = document.createElement('canvas')
	canvas.width = 960
	canvas.height = 600
	const ctx = canvas.getContext('2d')
	if (!ctx) return ''

	// Crisp mock dashboard card layout ideal for testing image annotation
	ctx.fillStyle = '#f8fafc'
	ctx.fillRect(0, 0, 960, 600)

	// Top header bar
	ctx.fillStyle = '#1e293b'
	ctx.fillRect(0, 0, 960, 64)
	ctx.fillStyle = '#ffffff'
	ctx.font = 'bold 22px Inter, sans-serif'
	ctx.fillText('Product UI Mockup — Ready to Annotate', 28, 40)

	// Metric cards
	const cards = [
		{ title: 'Active Users', val: '12,480', color: '#2563eb', x: 32 },
		{ title: 'Conversion', val: '4.82%', color: '#16a34a', x: 336 },
		{ title: 'Avg Latency', val: '142 ms', color: '#ea580c', x: 640 },
	]
	for (const card of cards) {
		ctx.fillStyle = '#ffffff'
		ctx.strokeStyle = '#cbd5e1'
		ctx.lineWidth = 2
		ctx.fillRect(card.x, 96, 288, 128)
		ctx.strokeRect(card.x, 96, 288, 128)
		ctx.fillStyle = '#64748b'
		ctx.font = '600 15px Inter, sans-serif'
		ctx.fillText(card.title, card.x + 20, 132)
		ctx.fillStyle = card.color
		ctx.font = 'bold 34px Inter, sans-serif'
		ctx.fillText(card.val, card.x + 20, 184)
	}

	// Main chart box
	ctx.fillStyle = '#ffffff'
	ctx.strokeStyle = '#cbd5e1'
	ctx.fillRect(32, 256, 896, 308)
	ctx.strokeRect(32, 256, 896, 308)
	ctx.fillStyle = '#0f172a'
	ctx.font = 'bold 18px Inter, sans-serif'
	ctx.fillText('Weekly Signups (Use Pen, Arrows, Callouts & Highlights to Mark Up)', 56, 296)

	const bars = [120, 165, 148, 205, 185, 240, 222]
	const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
	bars.forEach((h, i) => {
		const bx = 76 + i * 116
		const by = 520 - h
		ctx.fillStyle = i === 5 ? '#2563eb' : '#93c5fd'
		ctx.fillRect(bx, by, 68, h)
		ctx.fillStyle = '#475569'
		ctx.font = '600 14px Inter, sans-serif'
		ctx.fillText(labels[i], bx + 18, 546)
	})

	return canvas.toDataURL('image/png')
}

export async function loadImageForAnnotation(
	editor: Editor,
	source: File | { dataUrl: string; name: string; mimeType?: string }
): Promise<AnnotatedImageSession> {
	const dataUrl = source instanceof File ? await readFileAsDataUrl(source) : source.dataUrl
	const name = source instanceof File ? source.name : source.name
	const mimeType =
		source instanceof File ? source.type || 'image/png' : source.mimeType || 'image/png'

	const { width, height } = await measureImage(dataUrl)
	// Fit comfortably into canvas space (max 1100px wide)
	const scale = width > 1100 ? 1100 / width : 1
	const targetW = Math.max(120, Math.round(width * scale))
	const targetH = Math.max(120, Math.round(height * scale))

	const assetId = AssetRecordType.createId()
	const shapeId = createShapeId()
	const vp = editor.getViewportPageBounds()
	const x = Math.round(vp.x + vp.w / 2 - targetW / 2)
	const y = Math.round(vp.y + vp.h / 2 - targetH / 2)

	const asset: TLImageAsset = {
		id: assetId,
		typeName: 'asset',
		type: 'image',
		props: {
			w: targetW,
			h: targetH,
			name,
			isAnimated: mimeType === 'image/gif',
			mimeType,
			src: dataUrl,
		},
		meta: {},
	}

	await uploadDataAsset(editor, asset)

	editor.markHistoryStoppingPoint('load-annotator-image')
	editor.run(() => {
		editor.createAssets([asset])
		editor.createShape<TLImageShape>({
			id: shapeId,
			type: 'image',
			x,
			y,
			isLocked: true,
			props: {
				w: targetW,
				h: targetH,
				assetId,
				altText: name,
			},
			meta: { role: 'annotator-base', fileName: name },
		})
		editor.sendToBack([shapeId])
	})

	// Switch to draw tool & frame image cleanly so user can immediately annotate
	editor.updateInstanceState({ isReadonly: false })
	editor.setCurrentTool('draw')
	editor.zoomToBounds(new Box(x - 36, y - 36, targetW + 72, targetH + 72), {
		animation: { duration: 320 },
		inset: 48,
	})

	return { shapeId, name, width: targetW, height: targetH }
}

export async function exportAnnotatedImage(
	editor: Editor,
	session: AnnotatedImageSession
): Promise<void> {
	const baseBounds = editor.getShapePageBounds(session.shapeId)
	if (!baseBounds) {
		throw new Error('Base image is no longer on the current page.')
	}

	const allShapes = editor.getCurrentPageShapes()
	const overlappingIds = allShapes
		.filter((s) => {
			const b = editor.getShapePageBounds(s.id)
			return b ? b.collides(baseBounds) : false
		})
		.map((s) => s.id)

	const { blob } = await editor.toImage(overlappingIds, {
		bounds: baseBounds,
		format: 'png',
		background: true,
		padding: 0,
		scale: 2,
	})

	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	const baseName = session.name.replace(/\.[^.]+$/, '')
	a.href = url
	a.download = `${baseName}-annotated.png`
	a.click()
	URL.revokeObjectURL(url)
}
