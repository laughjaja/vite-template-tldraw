import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { CanvasComment } from './useComments'

interface CommentsPanelProps {
	editor: Editor | null
	comments: CanvasComment[]
	activeCommentId: string | null
	isCommentMode: boolean
	onToggleCommentMode: () => void
	onAddComment: (opts: { text: string; shapeId?: string }) => void
	onAddReply: (commentId: string, text: string) => void
	onToggleResolve: (commentId: string) => void
	onDelete: (commentId: string) => void
	onFocus: (comment: CanvasComment) => void
	onClose: () => void
}

export function CommentsPanel({
	editor,
	comments,
	activeCommentId,
	isCommentMode,
	onToggleCommentMode,
	onAddComment,
	onAddReply,
	onToggleResolve,
	onDelete,
	onFocus,
	onClose,
}: CommentsPanelProps) {
	const [draft, setDraft] = useState('')
	const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
	const [showResolved, setShowResolved] = useState(false)

	const selectedShapeId = editor?.getSelectedShapeIds()[0]
	const visibleComments = showResolved ? comments : comments.filter((c) => !c.resolved)

	const handleCreate = () => {
		if (!draft.trim()) return
		onAddComment({
			text: draft.trim(),
			...(selectedShapeId ? { shapeId: selectedShapeId } : {}),
		})
		setDraft('')
	}

	return (
		<aside
			className="ws-comments-drawer"
			aria-label="Canvas Comments"
			onKeyDown={(e) => e.stopPropagation()}
		>
			<div className="ws-drawer-header">
				<div>
					<h3>Comments</h3>
					<span className="ws-muted">
						{comments.filter((c) => !c.resolved).length} open · {comments.length} total
					</span>
				</div>
				<div className="ws-header-btns">
					<button
						type="button"
						className={`ws-btn ${isCommentMode ? 'ws-btn-primary' : ''}`}
						onClick={onToggleCommentMode}
						title="Click anywhere on the canvas to drop a comment pin"
					>
						{isCommentMode ? 'Pin Mode: ON' : '+ Drop Pin'}
					</button>
					<button type="button" className="ws-btn" onClick={onClose}>
						✕
					</button>
				</div>
			</div>

			<div className="ws-comment-composer">
				<textarea
					className="ws-textarea"
					rows={2}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder={
						selectedShapeId
							? 'Add comment attached to selected shape…'
							: 'Add comment at center of view (or enable Drop Pin)…'
					}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							handleCreate()
						}
					}}
				/>
				<div className="ws-comment-composer-row">
					<label className="ws-checkbox-inline">
						<input
							type="checkbox"
							checked={showResolved}
							onChange={(e) => setShowResolved(e.target.checked)}
						/>
						<span>Show resolved</span>
					</label>
					<button
						type="button"
						className="ws-btn ws-btn-primary"
						disabled={!draft.trim()}
						onClick={handleCreate}
					>
						Comment
					</button>
				</div>
			</div>

			<div className="ws-comments-list">
				{visibleComments.length === 0 ? (
					<div className="ws-empty-comments">
						No open comments on this page. Turn on <strong>Drop Pin</strong> and click
						anywhere on the canvas, or type a comment above.
					</div>
				) : (
					visibleComments.map((c, idx) => (
						<div
							key={c.id}
							className={`ws-comment-card ${activeCommentId === c.id ? 'active' : ''} ${c.resolved ? 'resolved' : ''}`}
							onClick={() => onFocus(c)}
						>
							<div className="ws-comment-top">
								<span className="ws-comment-badge">#{idx + 1}</span>
								<strong className="ws-comment-author">{c.author}</strong>
								{c.shapeId && <span className="ws-comment-tag">Pinned to shape</span>}
								<div className="ws-comment-actions" onClick={(e) => e.stopPropagation()}>
									<button
										type="button"
										className="ws-link-btn"
										onClick={() => onToggleResolve(c.id)}
									>
										{c.resolved ? 'Reopen' : 'Resolve'}
									</button>
									<button
										type="button"
										className="ws-link-btn danger"
										onClick={() => onDelete(c.id)}
									>
										Delete
									</button>
								</div>
							</div>
							<p className="ws-comment-text">{c.text}</p>

							{c.replies.length > 0 && (
								<div className="ws-replies">
									{c.replies.map((r) => (
										<div key={r.id} className="ws-reply">
											<strong>{r.author}:</strong> {r.text}
										</div>
									))}
								</div>
							)}

							<div className="ws-reply-row" onClick={(e) => e.stopPropagation()}>
								<input
									className="ws-input ws-input-sm"
									placeholder="Reply…"
									value={replyDrafts[c.id] ?? ''}
									onChange={(e) =>
										setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
									}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && (replyDrafts[c.id] ?? '').trim()) {
											onAddReply(c.id, replyDrafts[c.id])
											setReplyDrafts((prev) => ({ ...prev, [c.id]: '' }))
										}
									}}
								/>
								<button
									type="button"
									className="ws-btn ws-btn-sm"
									disabled={!(replyDrafts[c.id] ?? '').trim()}
									onClick={() => {
										onAddReply(c.id, replyDrafts[c.id] ?? '')
										setReplyDrafts((prev) => ({ ...prev, [c.id]: '' }))
									}}
								>
									Reply
								</button>
							</div>
						</div>
					))
				)}
			</div>
		</aside>
	)
}
