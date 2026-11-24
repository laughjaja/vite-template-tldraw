import type { TLEditorSnapshot } from 'tldraw'

export interface TldrawProviderMetadata {
	snapshot: TLEditorSnapshot
	imageName: string
	url: string
	type: string
	width: number
	height: number
}

export interface WhiteboardImage {
	id: string
	name: string
	url: string
	snapshot: TLEditorSnapshot
	type: string
	width: number
	height: number
}
