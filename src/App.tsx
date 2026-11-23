import { useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import { useGeminiAgent } from './agent/useGeminiAgent'
import { ChatSidebar } from './components/ChatSidebar'
import { DrawingToolsBar } from './components/DrawingToolsBar'
import { WorkspaceBar } from './components/WorkspaceBar'
import { ImageAnnotatorModal } from './features/annotator/ImageAnnotatorModal'
import type { AnnotatedImageSession } from './features/annotator/imageAnnotatorUtils'
import { CommentsPanel } from './features/comments/CommentsPanel'
import { useComments } from './features/comments/useComments'
import { DocumentModal } from './features/document/DocumentModal'
import { DocumentShapeUtil } from './features/document/DocumentShapeUtil'
import { KanbanModal } from './features/kanban/KanbanModal'
import { MermaidModal } from './features/mermaid/MermaidModal'
import { PdfEditorModal } from './features/pdf/PdfEditorModal'
import type { PdfDocumentSession } from './features/pdf/pdfEditorUtils'
import { useBroadcastSync } from './features/sync/useBroadcastSync'

const CUSTOM_SHAPE_UTILS = [DocumentShapeUtil]

function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)
	const [isCommentsOpen, setIsCommentsOpen] = useState(false)
	const [isMermaidOpen, setIsMermaidOpen] = useState(false)
	const [isKanbanOpen, setIsKanbanOpen] = useState(false)
	const [isDocumentOpen, setIsDocumentOpen] = useState(false)
	const [isImageAnnotatorOpen, setIsImageAnnotatorOpen] = useState(false)
	const [isPdfEditorOpen, setIsPdfEditorOpen] = useState(false)
	const [activeImageSession, setActiveImageSession] = useState<AnnotatedImageSession | null>(null)
	const [activePdfSession, setActivePdfSession] = useState<PdfDocumentSession | null>(null)
	const [isSyncEnabled, setIsSyncEnabled] = useState(true)
	const [isDarkTheme, setIsDarkTheme] = useState(false)

	const agent = useGeminiAgent(editor)
	const comments = useComments(editor)
	const sync = useBroadcastSync(editor, isSyncEnabled)

	const handleMount = (mountedEditor: Editor) => {
		// Ensure drawing tools are always unlocked on initial load
		if (mountedEditor.getInstanceState().isReadonly) {
			mountedEditor.updateInstanceState({ isReadonly: false })
		}
		setEditor(mountedEditor)
	}

	const handleDropCommentPin = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!editor) return
		const pagePoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
		const hitShape = editor.getShapeAtPoint(pagePoint)
		const text = window.prompt(
			hitShape ? 'Add comment on this shape:' : 'Add comment at this spot:'
		)
		if (text && text.trim()) {
			comments.addComment({
				text: text.trim(),
				x: Math.round(pagePoint.x),
				y: Math.round(pagePoint.y),
				...(hitShape ? { shapeId: hitShape.id } : {}),
			})
			setIsCommentsOpen(true)
		}
		comments.setIsCommentMode(false)
	}

	return (
		<div className={`app-root ${isDarkTheme ? 'theme-dark' : ''}`}>
			<WorkspaceBar
				editor={editor}
				isSidebarOpen={isSidebarOpen}
				onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
				isCommentsOpen={isCommentsOpen}
				onToggleComments={() => setIsCommentsOpen((open) => !open)}
				openCommentCount={comments.openCount}
				onOpenMermaid={() => setIsMermaidOpen(true)}
				onOpenKanban={() => setIsKanbanOpen(true)}
				onOpenDocument={() => setIsDocumentOpen(true)}
				onOpenImageAnnotator={() => setIsImageAnnotatorOpen(true)}
				onOpenPdfEditor={() => setIsPdfEditorOpen(true)}
				hasActiveImage={Boolean(activeImageSession)}
				hasActivePdf={Boolean(activePdfSession)}
				isSyncEnabled={isSyncEnabled}
				onToggleSync={() => setIsSyncEnabled((enabled) => !enabled)}
				syncPeerCount={sync.peerCount}
				onThemeChange={setIsDarkTheme}
			/>

			<div className="app-main">
				<DrawingToolsBar editor={editor} />

				<div className="canvas-pane">
					<Tldraw
						persistenceKey="tldraw-gemini-workspace"
						shapeUtils={CUSTOM_SHAPE_UTILS}
						options={{ deepLinks: true }}
						onMount={handleMount}
					/>

					{/* Floating comment pins & live multi-tab peer cursors */}
					<div className="ws-pin-layer">
						{comments.pageComments.map((c, idx) => {
							const pos = comments.pinPositions[c.id]
							if (!pos) return null
							return (
								<button
									key={c.id}
									type="button"
									className={`ws-comment-pin ${c.resolved ? 'resolved' : ''} ${comments.activeCommentId === c.id ? 'active' : ''}`}
									style={{ left: pos.x, top: pos.y }}
									title={`${c.author}: ${c.text}`}
									onClick={() => {
										setIsCommentsOpen(true)
										comments.focusComment(c)
									}}
								>
									#{idx + 1}
								</button>
							)
						})}

						{sync.viewportCursors.map((cursor) => (
							<div
								key={cursor.peerId}
								className="ws-peer-cursor"
								style={{ left: cursor.vx, top: cursor.vy }}
							>
								<span className="ws-peer-dot" style={{ background: cursor.color }} />
								<span className="ws-peer-label" style={{ background: cursor.color }}>
									{cursor.name}
								</span>
							</div>
						))}
					</div>

					{comments.isCommentMode && (
						<>
							<div className="ws-comment-capture" onClick={handleDropCommentPin} />
							<div className="ws-comment-mode-banner">
								<span>Click anywhere on the canvas to drop a comment pin</span>
								<button type="button" onClick={() => comments.setIsCommentMode(false)}>
									Cancel
								</button>
							</div>
						</>
					)}

					{agent.isModifyingCanvas && (
						<div className="canvas-modifying-pill" role="status" aria-live="polite">
							<span className="chat-spinner" />
							<span>Gemini is modifying the canvas…</span>
						</div>
					)}
				</div>

				{isCommentsOpen && (
					<CommentsPanel
						editor={editor}
						comments={comments.pageComments}
						activeCommentId={comments.activeCommentId}
						isCommentMode={comments.isCommentMode}
						onToggleCommentMode={() => comments.setIsCommentMode((m) => !m)}
						onAddComment={comments.addComment}
						onAddReply={comments.addReply}
						onToggleResolve={comments.toggleResolve}
						onDelete={comments.deleteComment}
						onFocus={comments.focusComment}
						onClose={() => setIsCommentsOpen(false)}
					/>
				)}

				<ChatSidebar
					isOpen={isSidebarOpen}
					onToggle={() => setIsSidebarOpen((open) => !open)}
					messages={agent.messages}
					connectionState={agent.connectionState}
					connectionMessage={agent.connectionMessage}
					model={agent.model}
					onModelChange={agent.setModel}
					availableModels={agent.availableModels}
					includeScreenshot={agent.includeScreenshot}
					onToggleScreenshot={agent.setIncludeScreenshot}
					isGenerating={agent.isGenerating}
					isModifyingCanvas={agent.isModifyingCanvas}
					activePhase={agent.activePhase}
					globalError={agent.globalError}
					canvasStats={agent.canvasStats}
					onSend={agent.sendMessage}
					onStop={agent.stopGeneration}
					onClear={agent.clearHistory}
					onRetryHealth={agent.checkHealth}
				/>
			</div>

			{isMermaidOpen && <MermaidModal editor={editor} onClose={() => setIsMermaidOpen(false)} />}
			{isKanbanOpen && <KanbanModal editor={editor} onClose={() => setIsKanbanOpen(false)} />}
			{isDocumentOpen && <DocumentModal editor={editor} onClose={() => setIsDocumentOpen(false)} />}
			{isImageAnnotatorOpen && (
				<ImageAnnotatorModal
					editor={editor}
					activeSession={activeImageSession}
					onSessionChange={setActiveImageSession}
					onClose={() => setIsImageAnnotatorOpen(false)}
				/>
			)}
			{isPdfEditorOpen && (
				<PdfEditorModal
					editor={editor}
					activePdf={activePdfSession}
					onPdfChange={setActivePdfSession}
					onClose={() => setIsPdfEditorOpen(false)}
				/>
			)}
		</div>
	)
}

export default App
