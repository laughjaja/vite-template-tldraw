import type { Editor, TLImageAsset } from 'tldraw'

/** Store studio-generated images through the editor's configured asset service. */
export async function uploadDataAsset(editor: Editor, asset: TLImageAsset) {
	if (!asset.props.src?.startsWith('data:')) return
	const response = await fetch(asset.props.src)
	const blob = await response.blob()
	const file = new File([blob], asset.props.name || 'canvas-image', { type: asset.props.mimeType || blob.type })
	const uploaded = await editor.uploadAsset(asset, file)
	asset.props.src = uploaded.src
}
