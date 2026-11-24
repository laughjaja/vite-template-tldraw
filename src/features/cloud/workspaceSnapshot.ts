import { createTLStore, defaultShapeUtils, defaultBindingUtils, loadSnapshot, type Editor, type TLAsset, type TLEditorSnapshot, type TLRecord } from 'tldraw'
import { DocumentShapeUtil } from '../document/DocumentShapeUtil'
import { COMMENT_PREFIX, isCanvasComment, loadLegacyComments, readSharedComments } from '../comments/useComments'
import { cloudAssets } from './cloudStore'

function downloadJson(value: unknown, filename: string) {
	const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function blobAsDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result))
		reader.onerror = () => reject(new Error('Could not read workspace asset.'))
		reader.readAsDataURL(blob)
	})
}

export async function exportWorkspace(editor: Editor) {
	const snapshot = structuredClone(editor.getSnapshot())
	for (const record of Object.values(snapshot.document.store)) {
		if (record.typeName !== 'asset' || !('src' in record.props) || !record.props.src) continue
		const asset = record as TLAsset
		const resolved = await editor.resolveAssetUrl(asset.id, { shouldResolveToOriginal: true })
		if (!resolved) throw new Error('One workspace asset is unavailable. Export stopped to avoid an incomplete backup.')
		const response = await fetch(resolved)
		if (!response.ok) throw new Error(`Could not export asset (HTTP ${response.status}).`)
		;(asset.props as { src: string }).src = await blobAsDataUrl(await response.blob())
	}
	downloadJson({ format: 'jastldraw-workspace-v1', snapshot }, `jastldraw-${new Date().toISOString().slice(0, 10)}.tldr.json`)
}

export function exportLegacyComments() {
	downloadJson({ format: 'jastldraw-comments-v1', comments: loadLegacyComments() }, 'jastldraw-legacy-comments.json')
}

export async function importWorkspace(editor: Editor, file: File) {
	const parsed = JSON.parse(await file.text())
	if (!parsed || typeof parsed !== 'object') throw new Error('Invalid workspace file.')
	// Import old comments explicitly. Never overwrite or clear the browser's legacy copy.
	if (parsed.format === 'jastldraw-comments-v1') {
		if (!Array.isArray(parsed.comments) || !parsed.comments.every(isCanvasComment)) throw new Error('Invalid comments file.')
		const document = editor.getDocumentSettings()
		const meta = { ...document.meta }
		for (const comment of parsed.comments) {
			if (!editor.getPages().some((page) => page.id === comment.pageId)) throw new Error('Import the matching board before its comments.')
			const key = COMMENT_PREFIX + comment.id
			if (!(key in meta)) meta[key] = comment
		}
		editor.updateDocumentSettings({ meta })
		return true
	}
	const snapshot = (parsed.format === 'jastldraw-workspace-v1' ? parsed.snapshot : parsed) as Partial<TLEditorSnapshot>
	if (!snapshot?.document?.store || !snapshot.document.schema) throw new Error('File does not contain a tldraw document snapshot.')
	const records = Object.values(snapshot.document.store) as TLRecord[]
	if (records.some((record) => record.typeName === 'asset' && 'src' in record.props && typeof record.props.src === 'string' && /^(asset:|blob:)/.test(record.props.src))) {
		throw new Error('This file refers to browser-only assets. Export a portable backup from the original browser before importing.')
	}
	if (editor.getPages().length > 1 || readSharedComments(editor.getDocumentSettings().meta).length > 0 || editor.getPages().some((page) => editor.getPageShapeIds(page.id).size > 0)) {
		if (!window.confirm('Import replaces the shared board for every signed-in device. Continue? A backup will download first. Cancel keeps the board unchanged.')) return false
		await exportWorkspace(editor)
	}
	// Validate and migrate the snapshot in a detached store before uploading or replacing shared records.
	const temporary = createTLStore({ shapeUtils: [...defaultShapeUtils, DocumentShapeUtil], bindingUtils: defaultBindingUtils })
	loadSnapshot(temporary, snapshot)
	for (const record of records) {
		if (record.typeName !== 'asset' || !('src' in record.props) || !record.props.src) continue
		if (record.props.src.startsWith('data:')) {
			const blob = await (await fetch(record.props.src)).blob()
			const file = new File([blob], `${record.id.replace(/[^a-zA-Z0-9]/g, '_')}`, { type: blob.type })
			const uploaded = await cloudAssets.upload(record, file)
			record.props.src = uploaded.src
		}
	}
	editor.loadSnapshot(snapshot)
	editor.zoomToFit({ animation: { duration: 300 } })
	return true
}
