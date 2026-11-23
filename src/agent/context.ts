import {
	renderPlaintextFromRichText,
	type Editor,
	type TLArrowBinding,
	type TLArrowShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLNoteShape,
	type TLShape,
	type TLTextShape,
} from 'tldraw'
import type { CanvasContextSnapshot, CanvasShapeSummary } from '../../shared/agentTypes'
import type { DocumentShape } from '../features/document/DocumentShapeUtil'
import { htmlToPlaintext } from '../features/document/documentUtils'

const MAX_SHAPES_IN_CONTEXT = 120

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

function extractShapeSummary(
	editor: Editor,
	shape: TLShape,
	selectedSet: Set<string>
): CanvasShapeSummary {
	const bounds = editor.getShapePageBounds(shape.id)
	const base: CanvasShapeSummary = {
		id: shape.id,
		type: shape.type,
		x: round1(bounds ? bounds.x : shape.x),
		y: round1(bounds ? bounds.y : shape.y),
		w: round1(bounds ? bounds.w : 0),
		h: round1(bounds ? bounds.h : 0),
		parentId: shape.parentId,
		isLocked: shape.isLocked,
		selected: selectedSet.has(shape.id),
	}

	if (shape.type === 'geo') {
		const geoShape = shape as TLGeoShape
		const text = renderPlaintextFromRichText(editor, geoShape.props.richText).trim()
		base.geo = geoShape.props.geo
		base.color = geoShape.props.color
		base.fill = geoShape.props.fill
		base.size = geoShape.props.size
		if (text) base.text = text
	} else if (shape.type === 'text') {
		const textShape = shape as TLTextShape
		const text = renderPlaintextFromRichText(editor, textShape.props.richText).trim()
		base.color = textShape.props.color
		base.size = textShape.props.size
		if (text) base.text = text
	} else if (shape.type === 'note') {
		const noteShape = shape as TLNoteShape
		const text = renderPlaintextFromRichText(editor, noteShape.props.richText).trim()
		base.color = noteShape.props.color
		base.size = noteShape.props.size
		if (text) base.text = text
	} else if (shape.type === 'frame') {
		const frameShape = shape as TLFrameShape
		base.color = frameShape.props.color
		if (frameShape.props.name) {
			base.frameName = frameShape.props.name
			base.text = frameShape.props.name
		}
	} else if (shape.type === 'document') {
		const docShape = shape as DocumentShape
		const body = htmlToPlaintext(docShape.props.html).slice(0, 2500)
		base.text = `# ${docShape.props.title}\n\n${body}`.trim()
	} else if (shape.type === 'arrow') {
		const arrowShape = shape as TLArrowShape
		const text = renderPlaintextFromRichText(editor, arrowShape.props.richText).trim()
		base.color = arrowShape.props.color
		if (text) base.text = text

		const bindings = editor.getBindingsFromShape<TLArrowBinding>(arrowShape.id, 'arrow')
		for (const binding of bindings) {
			if (binding.props.terminal === 'start') {
				base.fromShapeId = binding.toId
			} else if (binding.props.terminal === 'end') {
				base.toShapeId = binding.toId
			}
		}
	}

	return base
}

async function captureCanvasScreenshot(editor: Editor, shapes: TLShape[]): Promise<string | undefined> {
	if (shapes.length === 0) return undefined

	try {
		const viewportBounds = editor.getViewportPageBounds()
		const visibleShapes = shapes.filter((shape) => {
			const b = editor.getShapePageBounds(shape.id)
			return b ? b.collides(viewportBounds) : false
		})
		const targetIds = (visibleShapes.length > 0 ? visibleShapes : shapes)
			.slice(0, 80)
			.map((s) => s.id)

		const exported = await editor.toImageDataUrl(targetIds, {
			format: 'png',
			background: true,
			padding: 24,
			scale: 0.75,
			pixelRatio: 1,
		})

		const commaIdx = exported.url.indexOf(',')
		if (commaIdx === -1) return undefined
		const base64 = exported.url.slice(commaIdx + 1)
		if (base64.length > 3 * 1024 * 1024) return undefined
		return base64
	} catch {
		return undefined
	}
}

export async function collectCanvasContext(
	editor: Editor,
	includeScreenshot = true
): Promise<CanvasContextSnapshot> {
	const currentPage = editor.getCurrentPage()
	const pages = editor.getPages().map((p) => ({
		id: p.id,
		name: p.name,
		isCurrent: p.id === currentPage.id,
	}))
	const instanceState = editor.getInstanceState()
	const userPrefs = editor.user.getUserPreferences()
	const viewport = editor.getViewportPageBounds()
	const selectedShapeIds = editor.getSelectedShapeIds()
	const selectedSet = new Set<string>(selectedShapeIds)
	const allShapes = editor.getCurrentPageShapes()

	const prioritized = [
		...allShapes.filter((s) => selectedSet.has(s.id)),
		...allShapes.filter((s) => !selectedSet.has(s.id)),
	].slice(0, MAX_SHAPES_IN_CONTEXT)

	const summaries = prioritized.map((shape) => extractShapeSummary(editor, shape, selectedSet))

	const screenshotBase64 = includeScreenshot
		? await captureCanvasScreenshot(editor, allShapes)
		: undefined

	return {
		pageId: currentPage.id,
		pageName: currentPage.name,
		pages,
		editorState: {
			isGridMode: instanceState.isGridMode,
			isReadonly: instanceState.isReadonly,
			isSnapMode: userPrefs.isSnapMode,
			colorScheme: userPrefs.colorScheme ?? 'light',
		},
		viewport: {
			x: round1(viewport.x),
			y: round1(viewport.y),
			w: round1(viewport.w),
			h: round1(viewport.h),
			centerX: round1(viewport.x + viewport.w / 2),
			centerY: round1(viewport.y + viewport.h / 2),
		},
		totalShapeCount: allShapes.length,
		selectedShapeIds: [...selectedShapeIds],
		shapes: summaries,
		...(screenshotBase64 ? { screenshotBase64 } : {}),
	}
}
