import type { TLAssetStore } from 'tldraw'

export const ROOM_ID = 'jastldraw-default'

export function syncUri() {
	const url = new URL(`/api/connect/${ROOM_ID}`, window.location.href)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url.toString()
}

export const cloudAssets: TLAssetStore = {
	async upload(_asset, file, abortSignal) {
		const objectName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)}`
		const src = `/api/uploads/${objectName}`
		const response = await fetch(src, {
			method: 'PUT',
			body: file,
			headers: { 'Content-Type': file.type || 'application/octet-stream' },
			credentials: 'same-origin',
			signal: abortSignal,
		})
		if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}). Sign in again if your session expired.`)
		return { src }
	},
	resolve(asset) {
		return asset.props.src
	},
}
