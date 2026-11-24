import { useCallback, useEffect, useMemo, useState } from 'react'
import {
	DefaultSizeStyle,
	Tldraw,
	type Editor,
	type TLComponents,
	type TLUiOverrides,
} from 'tldraw'
import { BottomToolbar } from './components/BottomToolbar'
import {
	createCanvasGridComponent,
	type CanvasGridStyle,
} from './components/CustomCanvasGrid'
import { WorkspaceBar } from './components/WorkspaceBar'
import { AgentPanel } from './features/agent/AgentPanel'
import { MakeRealDialog } from './features/makeReal/MakeRealDialog'
import type { TldrawAgentApp } from './officialAgent/agent/TldrawAgentApp'
import { TldrawAgentAppProvider } from './officialAgent/agent/TldrawAgentAppProvider'
import { AgentHighlightOverlayUtil } from './officialAgent/overlays/AgentHighlightOverlayUtil'
import { TargetAreaTool } from './officialAgent/tools/TargetAreaTool'
import { TargetShapeTool } from './officialAgent/tools/TargetShapeTool'
import { PreviewShapeUtil } from './features/makeReal/PreviewShape'
import { WorkspacePanel } from './features/workspaces/WorkspacePanel'
import { WorkflowPanel } from './features/workflow/WorkflowPanel'
import { Chat } from './officialChat/components/Chat'
import { OnCanvasComponentPicker } from './workflowOfficial/components/OnCanvasComponentPicker'
import { WorkflowRegions } from './workflowOfficial/components/WorkflowRegions'
import { overrides } from './workflowOfficial/components/WorkflowToolbar'
import { ConnectionBindingUtil } from './workflowOfficial/connection/ConnectionBindingUtil'
import { ConnectionCenterHandleOverlayUtil } from './workflowOfficial/connection/ConnectionCenterHandleOverlayUtil'
import { ConnectionShapeUtil } from './workflowOfficial/connection/ConnectionShapeUtil'
import { keepConnectionsAtBottom } from './workflowOfficial/connection/keepConnectionsAtBottom'
import { disableTransparency } from './workflowOfficial/disableTransparency'
import { NodeShapeUtil } from './workflowOfficial/nodes/NodeShapeUtil'
import { PointingPort } from './workflowOfficial/ports/PointingPort'
import { ImageAnnotatorModal } from './features/annotator/ImageAnnotatorModal'
import type { AnnotatedImageSession } from './features/annotator/imageAnnotatorUtils'
import {
	applyColorSettingsToEditor,
	loadUserColorSettings,
	type UserColorSettings,
} from './features/colors/colorUtils'
import { CommentsPanel } from './features/comments/CommentsPanel'
import { useComments } from './features/comments/useComments'
import { DocumentModal } from './features/document/DocumentModal'
import { DocumentShapeUtil } from './features/document/DocumentShapeUtil'
import { KanbanModal } from './features/kanban/KanbanModal'
import { MermaidModal } from './features/mermaid/MermaidModal'
import { PdfEditorModal } from './features/pdf/PdfEditorModal'
import type { PdfDocumentSession } from './features/pdf/pdfEditorUtils'
import { useBroadcastSync } from './features/sync/useBroadcastSync'

DefaultSizeStyle.setDefaultValue('s')

const CUSTOM_SHAPE_UTILS = [DocumentShapeUtil, PreviewShapeUtil, NodeShapeUtil, ConnectionShapeUtil]
const BINDING_UTILS = [ConnectionBindingUtil]
const OVERLAY_UTILS = [ConnectionCenterHandleOverlayUtil, AgentHighlightOverlayUtil]
const AGENT_TOOLS = [TargetShapeTool, TargetAreaTool]
const AGENT_OVERRIDES: TLUiOverrides = {
	tools: (editor, tools) => ({
		...tools,
		'target-area': {
			id: 'target-area',
			label: 'Pick Area',
			kbd: 'c',
			icon: 'tool-frame',
			onSelect() {
				editor.setCurrentTool('target-area')
			},
		},
		'target-shape': {
			id: 'target-shape',
			label: 'Pick Shape',
			kbd: 's',
			icon: 'tool-frame',
			onSelect() {
				editor.setCurrentTool('target-shape')
			},
		},
	}),
}
const GRID_STORAGE_KEY = 'jastldraw-grid-style-v1'

function loadGridStyle(): CanvasGridStyle {
	try {
		const raw = localStorage.getItem(GRID_STORAGE_KEY)
		if (raw === 'dots' || raw === 'lines' || raw === 'none') return raw
	} catch {
		// Default to dot canvas
	}
	return 'dots'
}

function App() {
	const [editor, setEditor] = useState<Editor | null>(null)
	const [isSidebarOpen, setIsSidebarOpen] = useState(true)
	const [sidebarTab, setSidebarTab] = useState<'chat' | 'agent' | 'workflow' | 'workspaces'>('chat')
	const [isAgentEnabled, setIsAgentEnabled] = useState(false)
	const [agentApp, setAgentApp] = useState<TldrawAgentApp | null>(null)
	const [isCommentsOpen, setIsCommentsOpen] = useState(false)
	const [isMermaidOpen, setIsMermaidOpen] = useState(false)
	const [isMakeRealOpen, setIsMakeRealOpen] = useState(false)
	const [isKanbanOpen, setIsKanbanOpen] = useState(false)
	const [isDocumentOpen, setIsDocumentOpen] = useState(false)
	const [isImageAnnotatorOpen, setIsImageAnnotatorOpen] = useState(false)
	const [isPdfEditorOpen, setIsPdfEditorOpen] = useState(false)
	const [activeImageSession, setActiveImageSession] = useState<AnnotatedImageSession | null>(null)
	const [activePdfSession, setActivePdfSession] = useState<PdfDocumentSession | null>(null)
	const [isSyncEnabled, setIsSyncEnabled] = useState(true)
	const [isDarkTheme, setIsDarkTheme] = useState(false)
	const [gridStyle, setGridStyle] = useState<CanvasGridStyle>(() => loadGridStyle())
	const [colorSettings, setColorSettings] = useState<UserColorSettings>(() =>
		loadUserColorSettings()
	)

	const comments = useComments(editor)
	const sync = useBroadcastSync(editor, isSyncEnabled)

	const handleAgentUnmount = useCallback(() => setAgentApp(null), [])

	// Persist grid style and sync tldraw's isGridMode flag
	useEffect(() => {
		try {
			localStorage.setItem(GRID_STORAGE_KEY, gridStyle)
		} catch {
			// Ignore quota errors
		}
		if (editor) {
			editor.updateInstanceState({ isGridMode: gridStyle !== 'none' })
		}
	}, [editor, gridStyle])

	const cycleGridStyle = () => {
		setGridStyle((cur) => (cur === 'dots' ? 'lines' : cur === 'lines' ? 'none' : 'dots'))
	}

	const tldrawComponents = useMemo<TLComponents>(
		() => ({
			Toolbar: null,
			Grid: createCanvasGridComponent(gridStyle, isDarkTheme),
			InFrontOfTheCanvas: () => (
				<>
					<OnCanvasComponentPicker />
					<WorkflowRegions />
				</>
			),
		}),
		[gridStyle, isDarkTheme]
	)

	const handleMount = (mountedEditor: Editor) => {
		if (mountedEditor.getInstanceState().isReadonly) {
			mountedEditor.updateInstanceState({ isReadonly: false })
		}
		mountedEditor.updateInstanceState({ isGridMode: gridStyle !== 'none' })
		applyColorSettingsToEditor(mountedEditor, colorSettings, true)
		keepConnectionsAtBottom(mountedEditor)
		disableTransparency(mountedEditor, ['node', 'connection'])
		const selectTool = mountedEditor.getStateDescendant('select')
		if (selectTool && !selectTool.children?.pointing_port) {
			selectTool.addChild(PointingPort)
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
				onMakeReal={() => setIsMakeRealOpen(true)}
				onOpenKanban={() => setIsKanbanOpen(true)}
				onOpenDocument={() => setIsDocumentOpen(true)}
				onOpenImageAnnotator={() => setIsImageAnnotatorOpen(true)}
				onOpenPdfEditor={() => setIsPdfEditorOpen(true)}
				hasActiveImage={Boolean(activeImageSession)}
				hasActivePdf={Boolean(activePdfSession)}
				gridStyle={gridStyle}
				onCycleGridStyle={cycleGridStyle}
				isSyncEnabled={isSyncEnabled}
				onToggleSync={() => setIsSyncEnabled((enabled) => !enabled)}
				syncPeerCount={sync.peerCount}
				onThemeChange={setIsDarkTheme}
			/>

			<div className="app-main">
				<div className="canvas-pane">
					<Tldraw
						persistenceKey="tldraw-gemini-workspace"
						shapeUtils={CUSTOM_SHAPE_UTILS}
						bindingUtils={BINDING_UTILS}
						overlayUtils={OVERLAY_UTILS}
						tools={AGENT_TOOLS}
						overrides={[overrides, AGENT_OVERRIDES]}
						components={tldrawComponents}
						options={{ deepLinks: true, maxPages: 1 }}
						onMount={handleMount}
					>
						<TldrawAgentAppProvider
							onMount={setAgentApp}
							onUnmount={handleAgentUnmount}
						/>
					</Tldraw>

					<BottomToolbar
						editor={editor}
						isDark={isDarkTheme}
						colorSettings={colorSettings}
						onColorSettingsChange={setColorSettings}
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

				<aside className={`chat-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
					<div className="chat-sidebar-header">
						<button type="button" onClick={() => setIsSidebarOpen((open) => !open)}>
							{isSidebarOpen ? 'Hide' : 'Show'}
						</button>
						<nav className="native-sidebar-tabs" aria-label="Assistant panels">
							<button
								type="button"
								className={sidebarTab === 'chat' ? 'active' : ''}
								onClick={() => setSidebarTab('chat')}
							>
								Chat
							</button>
							<button
								type="button"
								className={sidebarTab === 'agent' ? 'active' : ''}
								onClick={() => setSidebarTab('agent')}
							>
								Agent
							</button>
							<button
								type="button"
								className={sidebarTab === 'workflow' ? 'active' : ''}
								onClick={() => setSidebarTab('workflow')}
							>
								Workflow
							</button>
							<button
								type="button"
								className={sidebarTab === 'workspaces' ? 'active' : ''}
								onClick={() => setSidebarTab('workspaces')}
							>
								Files
							</button>
						</nav>
					</div>
					<div className="native-sidebar-content">
						{sidebarTab === 'chat' && <Chat editor={editor ?? undefined} />}
						{sidebarTab === 'agent' && (
							<AgentPanel
								enabled={isAgentEnabled}
								onEnabledChange={setIsAgentEnabled}
								agentApp={agentApp}
							/>
						)}
						{sidebarTab === 'workflow' && <WorkflowPanel editor={editor ?? undefined} />}
						{sidebarTab === 'workspaces' && (
							<WorkspacePanel editor={editor} comments={comments.comments} />
						)}
					</div>
				</aside>
			</div>

			{isMakeRealOpen && <MakeRealDialog editor={editor} onClose={() => setIsMakeRealOpen(false)} />}
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
