import { useCallback, useEffect, useState } from 'react'
import type { Editor, TLShapeId, JsonObject } from 'tldraw'

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

export function loadLegacyComments(): CanvasComment[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.filter(isCanvasComment) : []
	} catch {
		return []
	}
}

export const COMMENT_PREFIX = 'jastldraw-comment:'

export function isCanvasComment(value: unknown): value is CanvasComment {
	if (!value || typeof value !== 'object') return false
	const comment = value as CanvasComment
	return typeof comment.id === 'string' && typeof comment.pageId === 'string' &&
		typeof comment.x === 'number' && Number.isFinite(comment.x) && typeof comment.y === 'number' && Number.isFinite(comment.y) &&
		typeof comment.author === 'string' && typeof comment.text === 'string' &&
		typeof comment.resolved === 'boolean' && typeof comment.createdAt === 'number' && Array.isArray(comment.replies) &&
		comment.replies.every((reply) => reply && typeof reply.id === 'string' && typeof reply.author === 'string' && typeof reply.text === 'string' && typeof reply.createdAt === 'number')
}

export function readSharedComments(meta: JsonObject): CanvasComment[] {
	return Object.entries(meta).filter(([key]) => key.startsWith(COMMENT_PREFIX)).map(([, value]): unknown => value)
		.filter(isCanvasComment).sort((a, b) => b.createdAt - a.createdAt)
}

function makeId(): string {
	return `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function useComments(editor: Editor | null) {
	const [comments, setCommentState] = useState<CanvasComment[]>([])
	const setComments = useCallback((update: (previous: CanvasComment[]) => CanvasComment[]) => {
		if (!editor) return
		const document = editor.getDocumentSettings()
		const previous = readSharedComments(document.meta)
		const next = update(previous)
		const meta = { ...document.meta }
		for (const key of Object.keys(meta)) if (key.startsWith(COMMENT_PREFIX)) delete meta[key]
		for (const comment of next) meta[COMMENT_PREFIX + comment.id] = JSON.parse(JSON.stringify(comment))
		editor.updateDocumentSettings({ meta })
	}, [editor])
	const [isCommentMode, setIsCommentMode] = useState(false)
	const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
	const [currentPageId, setCurrentPageId] = useState<string>('page:page')
	const [pinPositions, setPinPositions] = useState<Record<string, { x: number; y: number }>>({})

	useEffect(() => {
		if (!editor) return
		const refresh = () => setCommentState(readSharedComments(editor.getDocumentSettings().meta))
		refresh()
		return editor.store.listen(refresh, { scope: 'document' })
	}, [editor])

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
		[editor, setComments]
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
	}, [setComments])

	const toggleResolve = useCallback((commentId: string) => {
		setComments((prev) =>
			prev.map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c))
		)
	}, [setComments])

	const deleteComment = useCallback((commentId: string) => {
		setComments((prev) => prev.filter((c) => c.id !== commentId))
		setActiveCommentId((prev) => (prev === commentId ? null : prev))
	}, [setComments])

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
