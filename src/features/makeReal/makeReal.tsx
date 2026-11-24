import { Editor, createShapeId } from 'tldraw'
import { PreviewShape } from './PreviewShape'
import { blobToBase64 } from './blobToBase64'
import { getTextFromSelectedShapes } from './getSelectionAsText'

export async function makeReal(editor: Editor, instruction = '') {
	const selectedShapes = editor.getSelectedShapes()
	if (selectedShapes.length === 0) throw Error('First select something to make real.')

	const bounds = editor.getSelectionPageBounds()
	if (!bounds) throw Error('Could not get bounds of selection.')

	const newShapeId = createShapeId()
	editor.createShape<PreviewShape>({
		id: newShapeId,
		type: 'response',
		x: bounds.maxX + 60,
		y: bounds.midY - (540 * 2) / 3 / 2,
		props: { html: '' },
	})

	try {
		const scale = Math.min(1, 1000 / bounds.width, 1000 / bounds.height)
		const { blob } = await editor.toImage(selectedShapes, {
			scale,
			background: true,
			format: 'jpeg',
		})
		if (!blob) throw Error('Could not capture the selected design.')
		const previousPreviews = selectedShapes.filter(
			(shape) => shape.type === 'response'
		) as PreviewShape[]

		const response = await fetch('/api/make-real', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				image: await blobToBase64(blob),
				text: [getTextFromSelectedShapes(editor), instruction.trim() ? `Requested changes: ${instruction.trim()}` : ''].filter(Boolean).join('\n\n'),
				theme: editor.user.getIsDarkMode() ? 'dark' : 'light',
				previousPreviews: previousPreviews.map((shape) => shape.props.html),
			}),
		})
		const result = (await response.json()) as { html?: string; error?: string }
		if (!response.ok || !result.html || result.html.length < 100) {
			throw Error(result.error || 'Could not generate a design from those wireframes.')
		}

		editor.updateShape<PreviewShape>({
			id: newShapeId,
			type: 'response',
			props: { html: result.html },
		})
	} catch (error) {
		editor.deleteShape(newShapeId)
		throw error
	}
}
