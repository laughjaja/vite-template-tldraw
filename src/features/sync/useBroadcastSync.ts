import { useEffect, useRef, useState } from 'react'
import type { Editor, RecordsDiff, TLRecord } from 'tldraw'

interface PeerCursor {
	peerId: string
	name: string
	color: string
	pageId: string
	x: number
	y: number
	lastSeen: number
}

type SyncMessage =
	| { type: 'hello'; peerId: string; name: string; color: string }
	| { type: 'bye'; peerId: string }
	| { type: 'diff'; peerId: string; changes: RecordsDiff<TLRecord> }
	| {
			type: 'cursor'
			peerId: string
			name: string
			color: string
			pageId: string
			x: number
			y: number
	  }

const CHANNEL_NAME = 'tldraw-gemini-tab-sync-v1'
const PEER_COLORS = ['#2563eb', '#059669', '#d97706', '#9333ea', '#e11d48']

export function useBroadcastSync(editor: Editor | null, enabled: boolean) {
	const peerIdRef = useRef(`tab-${Math.random().toString(36).slice(2, 8)}`)
	const colorRef = useRef(PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)])
	const nameRef = useRef(`Tab ${peerIdRef.current.slice(-4).toUpperCase()}`)

	const [peers, setPeers] = useState<Record<string, PeerCursor>>({})
	const [viewportCursors, setViewportCursors] = useState<
		Array<{ peerId: string; name: string; color: string; vx: number; vy: number }>
	>([])

	useEffect(() => {
		if (!editor || !enabled || typeof BroadcastChannel === 'undefined') {
			setPeers({})
			setViewportCursors([])
			return
		}

		const channel = new BroadcastChannel(CHANNEL_NAME)
		const peerId = peerIdRef.current

		channel.postMessage({
			type: 'hello',
			peerId,
			name: nameRef.current,
			color: colorRef.current,
		} satisfies SyncMessage)

		channel.onmessage = (event: MessageEvent<SyncMessage>) => {
			const msg = event.data
			if (!msg || msg.peerId === peerId) return

			if (msg.type === 'hello') {
				setPeers((prev) => ({
					...prev,
					[msg.peerId]: {
						peerId: msg.peerId,
						name: msg.name,
						color: msg.color,
						pageId: editor.getCurrentPageId(),
						x: 0,
						y: 0,
						lastSeen: Date.now(),
					},
				}))
				channel.postMessage({
					type: 'cursor',
					peerId,
					name: nameRef.current,
					color: colorRef.current,
					pageId: editor.getCurrentPageId(),
					x: editor.inputs.getCurrentPagePoint().x,
					y: editor.inputs.getCurrentPagePoint().y,
				} satisfies SyncMessage)
			} else if (msg.type === 'bye') {
				setPeers((prev) => {
					const copy = { ...prev }
					delete copy[msg.peerId]
					return copy
				})
			} else if (msg.type === 'diff') {
				editor.store.mergeRemoteChanges(() => {
					const { added, updated, removed } = msg.changes
					const toPut: TLRecord[] = [
						...Object.values(added),
						...Object.values(updated).map(([, to]) => to),
					]
					if (toPut.length > 0) {
						editor.store.put(toPut)
					}
					const toRemove = Object.values(removed).map((r) => r.id)
					if (toRemove.length > 0) {
						editor.store.remove(toRemove)
					}
				})
			} else if (msg.type === 'cursor') {
				setPeers((prev) => ({
					...prev,
					[msg.peerId]: {
						peerId: msg.peerId,
						name: msg.name,
						color: msg.color,
						pageId: msg.pageId,
						x: msg.x,
						y: msg.y,
						lastSeen: Date.now(),
					},
				}))
			}
		}

		// Broadcast local user document edits
		const unsubDoc = editor.store.listen(
			(entry) => {
				channel.postMessage({
					type: 'diff',
					peerId,
					changes: entry.changes,
				} satisfies SyncMessage)
			},
			{ source: 'user', scope: 'document' }
		)

		// Broadcast cursor movement throttled at ~50ms
		let lastCursorSent = 0
		const onPointerMove = () => {
			const now = Date.now()
			if (now - lastCursorSent < 50) return
			lastCursorSent = now
			const pt = editor.inputs.getCurrentPagePoint()
			channel.postMessage({
				type: 'cursor',
				peerId,
				name: nameRef.current,
				color: colorRef.current,
				pageId: editor.getCurrentPageId(),
				x: pt.x,
				y: pt.y,
			} satisfies SyncMessage)
		}
		window.addEventListener('pointermove', onPointerMove, { passive: true })

		// Expire stale peers
		const cleanupTimer = window.setInterval(() => {
			const cutoff = Date.now() - 20_000
			setPeers((prev) => {
				let changed = false
				const next: Record<string, PeerCursor> = {}
				for (const [id, p] of Object.entries(prev)) {
					if (p.lastSeen >= cutoff) next[id] = p
					else changed = true
				}
				return changed ? next : prev
			})
		}, 5000)

		return () => {
			window.clearInterval(cleanupTimer)
			window.removeEventListener('pointermove', onPointerMove)
			unsubDoc()
			channel.postMessage({ type: 'bye', peerId } satisfies SyncMessage)
			channel.close()
		}
	}, [editor, enabled])

	// Project peer cursors to viewport coordinates
	useEffect(() => {
		if (!editor || !enabled) {
			setViewportCursors([])
			return
		}
		const updateCursors = () => {
			const pageId = editor.getCurrentPageId()
			const list = Object.values(peers)
				.filter((p) => p.pageId === pageId)
				.map((p) => {
					const v = editor.pageToViewport({ x: p.x, y: p.y })
					return { peerId: p.peerId, name: p.name, color: p.color, vx: v.x, vy: v.y }
				})
			setViewportCursors(list)
		}
		updateCursors()
		const unsub = editor.store.listen(updateCursors, { scope: 'session' })
		return () => unsub()
	}, [editor, enabled, peers])

	return {
		peerCount: Object.keys(peers).length,
		viewportCursors,
	}
}
