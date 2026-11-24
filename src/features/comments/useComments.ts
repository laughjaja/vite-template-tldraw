import { useCallback, useEffect, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'

export interface CommentReply {
	id: string
	author: string
	text: string
	createdAt: number
}

export interface CanvasComment {
	id: string
	pageId: string
	x: number
	y: number
	shapeId?: string
	author: string
	text: string
	resolved: boolean
	createdAt: number
	replies: CommentReply[]
}

const STORAGE_KEY = 'tldraw-gemini-comments-v1'

function loadStoredComments(): CanvasComment[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? (parsed as CanvasComment[]) : []
	} catch {
		return []
	}
}

function makeId(): string {
	return `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function useComments(editor: Editor | null) {
	const [comments, setComments] = useState<CanvasComment[]>(() => loadStoredComments())
	const [isCommentMode, setIsCommentMode] = useState(false)
	const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
	const [currentPageId, setCurrentPageId] = useState<string>('page:page')
	const [pinPositions, setPinPositions] = useState<Record<string, { x: number; y: number }>>({})

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(comments))
		} catch {
			// Ignore storage quota errors
		}
	}, [comments])

	useEffect(() => {
		const restoreComments = (event: Event) => {
			const value: unknown = (event as CustomEvent).detail
			if (!Array.isArray(value)) return
			const valid = value.every((comment) => comment && typeof comment.id === 'string' &&
				typeof comment.pageId === 'string' && typeof comment.text === 'string' &&
				typeof comment.author === 'string' && typeof comment.x === 'number' &&
				typeof comment.y === 'number' && Array.isArray(comment.replies))
			if (valid) { setComments(value); setActiveCommentId(null) }
		}
		window.addEventListener('jastldraw-workspace-comments', restoreComments)
		return () => window.removeEventListener('jastldraw-workspace-comments', restoreComments)
	}, [])

	// Recompute viewport coordinates of pins whenever camera, page, or shapes change
	useEffect(() => {
		if (!editor) return

		const syncPins = () => {
			const pageId = editor.getCurrentPageId()
			setCurrentPageId(pageId)

			const next: Record<string, { x: number; y: number }> = {}
			for (const c of comments) {
				if (c.pageId !== pageId) continue
				let pageX = c.x
				let pageY = c.y
				if (c.shapeId) {
					const bounds = editor.getShapePageBounds(c.shapeId as TLShapeId)
					if (bounds) {
						pageX = bounds.maxX - 8
						pageY = bounds.y - 8
					}
				}
				const vp = editor.pageToViewport({ x: pageX, y: pageY })
				next[c.id] = { x: vp.x, y: vp.y }
			}
			setPinPositions(next)
		}

		syncPins()
		const unsub = editor.store.listen(syncPins, { scope: 'all' })
		return () => unsub()
	}, [editor, comments])

	const addComment = useCallback(
		(opts: {
			text: string
			x?: number
			y?: number
			shapeId?: string
			author?: string
		}) => {
			if (!editor || !opts.text.trim()) return null
			const pageId = editor.getCurrentPageId()
			const vp = editor.getViewportPageBounds()
			let x = opts.x ?? Math.round(vp.x + vp.w / 2)
			let y = opts.y ?? Math.round(vp.y + vp.h / 2)

			if (opts.shapeId) {
				const b = editor.getShapePageBounds(opts.shapeId as TLShapeId)
				if (b) {
					x = Math.round(b.maxX - 8)
					y = Math.round(b.y - 8)
				}
			}

			const created: CanvasComment = {
				id: makeId(),
				pageId,
				x,
				y,
				...(opts.shapeId ? { shapeId: opts.shapeId } : {}),
				author: opts.author ?? 'You',
				text: opts.text.trim(),
				resolved: false,
				createdAt: Date.now(),
				replies: [],
			}
			setComments((prev) => [created, ...prev])
			setActiveCommentId(created.id)
			return created
		},
		[editor]
	)

	const addReply = useCallback((commentId: string, text: string, author = 'You') => {
		const trimmed = text.trim()
		if (!trimmed) return
		setComments((prev) =>
			prev.map((c) =>
				c.id === commentId
					? {
							...c,
							replies: [
								...c.replies,
								{ id: makeId(), author, text: trimmed, createdAt: Date.now() },
							],
						}
					: c
			)
		)
	}, [])

	const toggleResolve = useCallback((commentId: string) => {
		setComments((prev) =>
			prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c))
		)
	}, [])

	const deleteComment = useCallback((commentId: string) => {
		setComments((prev) => prev.filter((c) => c.id !== commentId))
		setActiveCommentId((prev) => (prev === commentId ? null : prev))
	}, [])

	const focusComment = useCallback(
		(comment: CanvasComment) => {
			if (!editor) return
			if (editor.getCurrentPageId() !== comment.pageId) {
				const page = editor.getPages().find((p) => p.id === comment.pageId)
				if (page) editor.setCurrentPage(page.id)
			}
			let targetX = comment.x
			let targetY = comment.y
			if (comment.shapeId) {
				const b = editor.getShapePageBounds(comment.shapeId as TLShapeId)
				if (b) {
					targetX = b.midX
					targetY = b.midY
					editor.select(comment.shapeId as TLShapeId)
				}
			}
			editor.centerOnPoint({ x: targetX, y: targetY }, { animation: { duration: 280 } })
			setActiveCommentId(comment.id)
		},
		[editor]
	)

	const pageComments = comments.filter((c) => c.pageId === currentPageId)
	const openCount = pageComments.filter((c) => !c.resolved).length

	return {
		comments,
		pageComments,
		openCount,
		isCommentMode,
		setIsCommentMode,
		activeCommentId,
		setActiveCommentId,
		pinPositions,
		addComment,
		addReply,
		toggleResolve,
		deleteComment,
		focusComment,
	}
}
