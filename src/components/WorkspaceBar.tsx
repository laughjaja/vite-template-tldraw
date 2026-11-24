import { useEffect, useRef, useState } from 'react'
import { exportAs, type Editor } from 'tldraw'
import { exportWorkspace, importWorkspace, exportLegacyComments } from '../features/cloud/workspaceSnapshot'
import type { CanvasGridStyle } from './CustomCanvasGrid'
import './WorkspaceBar.css'

interface WorkspaceBarProps {
	editor: Editor | null
	isSidebarOpen: boolean
	onToggleSidebar: () => void
	isCommentsOpen: boolean
	onToggleComments: () => void
	openCommentCount: number
	onOpenMermaid: () => void
	onOpenKanban: () => void
	onOpenDocument: () => void
	onOpenImageAnnotator: () => void
	onOpenPdfEditor: () => void
	hasActiveImage: boolean
	hasActivePdf: boolean
	gridStyle: CanvasGridStyle
	onCycleGridStyle: () => void
	cloudStatus: string
	onThemeChange?: (isDark: boolean) => void
}

export function WorkspaceBar({
	editor,
	isSidebarOpen,
	onToggleSidebar,
	isCommentsOpen,
	onToggleComments,
	openCommentCount,
	onOpenMermaid,
	onOpenKanban,
	onOpenDocument,
	onOpenImageAnnotator,
	onOpenPdfEditor,
	hasActiveImage,
	hasActivePdf,
	gridStyle,
	onCycleGridStyle,
	cloudStatus,
	onThemeChange,
}: WorkspaceBarProps) {
	const [isReadonly, setIsReadonly] = useState(false)
	const [isSnapMode, setIsSnapMode] = useState(false)
	const [isDark, setIsDark] = useState(false)
	const [selectedCount, setSelectedCount] = useState(0)
	const [exportMenuOpen, setExportMenuOpen] = useState(false)
	const [toast, setToast] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	useEffect(() => {
		if (!editor) return
		const syncState = () => {
			const inst = editor.getInstanceState()
			const prefs = editor.user.getUserPreferences()
			const dark = prefs.colorScheme === 'dark'
			setIsReadonly(inst.isReadonly)
			setIsSnapMode(prefs.isSnapMode)
			setIsDark(dark)
			setSelectedCount(editor.getSelectedShapeIds().length)
			onThemeChange?.(dark)
		}
		syncState()
		const unsub = editor.store.listen(syncState, { scope: 'all' })
		return () => unsub()
	}, [editor, onThemeChange])

	const showToast = (msg: string) => {
		setToast(msg)
		window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2400)
	}

	const toggleSnap = () => {
		if (!editor) return
		editor.user.updateUserPreferences({ isSnapMode: !isSnapMode })
	}

	const toggleReadonly = () => {
		if (!editor) return
		editor.updateInstanceState({ isReadonly: !isReadonly })
	}

	const toggleTheme = () => {
		if (!editor) return
		editor.user.updateUserPreferences({ colorScheme: isDark ? 'light' : 'dark' })
	}

	const handleExportImage = async (format: 'png' | 'svg') => {
		setExportMenuOpen(false)
		if (!editor) return
		const selected = editor.getSelectedShapeIds()
		const ids = selected.length > 0 ? selected : editor.getCurrentPageShapeIds()
		const idArr = Array.from(ids)
		if (idArr.length === 0) {
			showToast('Nothing on canvas to export')
			return
		}
		try {
			await exportAs(editor, idArr, {
				format,
				name: `tldraw-canvas-${Date.now()}`,
			})
			showToast(`Exported ${format.toUpperCase()}`)
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Export failed')
		}
	}

	const handleSaveSnapshot = async () => {
		setExportMenuOpen(false)
		if (!editor) return
		try { await exportWorkspace(editor); showToast('Saved portable workspace backup') }
		catch (error) { showToast(error instanceof Error ? error.message : 'Backup failed') }
	}

	const handleImportSnapshot = async (file: File) => {
		if (!editor) return
		try { if (await importWorkspace(editor, file)) showToast(`Imported ${file.name}`) }
		catch (error) { showToast(error instanceof Error ? error.message : 'Import failed') }
	}

	const handleCopyDeepLink = async () => {
		setExportMenuOpen(false)
		try {
			await navigator.clipboard.writeText(window.location.href)
			showToast('Copied deep link URL')
		} catch {
			showToast('Copy failed — copy URL from address bar')
		}
	}

	return (
		<header className="ws-bar" onKeyDown={(e) => e.stopPropagation()}>
			<div className="ws-bar-group">
				<span className="ws-brand">
					<strong>jastldraw</strong>
				</span>
				<span className="ws-divider" />
				<button type="button" className="ws-bar-btn" onClick={onOpenMermaid} title="Mermaid Diagram Studio">
					Mermaid
				</button>
				<button type="button" className="ws-bar-btn" onClick={onOpenKanban} title="Kanban Board Builder">
					Kanban
				</button>
				<button type="button" className="ws-bar-btn" onClick={onOpenDocument} title="Upload & Edit Documents (.docx, .md, .txt, .html)">
					Doc
				</button>
				<button
					type="button"
					className={`ws-bar-btn ${hasActiveImage ? 'active' : ''}`}
					onClick={onOpenImageAnnotator}
					title="Image Annotator (load & mark up images)"
				>
					Image{hasActiveImage ? ' ●' : ''}
				</button>
				<button
					type="button"
					className={`ws-bar-btn ${hasActivePdf ? 'active' : ''}`}
					onClick={onOpenPdfEditor}
					title="PDF Editor & Annotator (open, mark up & export PDF)"
				>
					PDF{hasActivePdf ? ' ●' : ''}
				</button>
				<button
					type="button"
					className={`ws-bar-btn ${isCommentsOpen ? 'active' : ''}`}
					onClick={onToggleComments}
					title="Canvas Comments & Annotations"
				>
					Comments{openCommentCount > 0 ? ` (${openCommentCount})` : ''}
				</button>
			</div>

			<div className="ws-bar-group">
				<button
					type="button"
					className={`ws-bar-btn ${gridStyle !== 'none' ? 'active' : ''}`}
					onClick={onCycleGridStyle}
					title="Cycle canvas background: Dots → Lines → Blank"
				>
					Canvas: {gridStyle === 'dots' ? 'Dots' : gridStyle === 'lines' ? 'Lines' : 'Blank'}
				</button>
				<button
					type="button"
					className={`ws-bar-btn ${isSnapMode ? 'active' : ''}`}
					onClick={toggleSnap}
					title="Toggle snapping"
				>
					Snap
				</button>
				<button
					type="button"
					className={`ws-bar-btn ${isReadonly ? 'active warn' : ''}`}
					onClick={toggleReadonly}
					title="Toggle read-only mode"
				>
					{isReadonly ? 'Read-only' : 'Editable'}
				</button>
				<button
					type="button"
					className="ws-bar-btn"
					onClick={toggleTheme}
					title="Switch light / dark theme"
				>
					{isDark ? 'Light' : 'Dark'}
				</button>
				<button
					type="button"
					className="ws-bar-btn"
					onClick={() => editor?.zoomToFit({ animation: { duration: 280 } })}
					title="Zoom to fit all shapes"
				>
					Fit
				</button>

				{selectedCount > 0 && (
					<>
						<span className="ws-divider" />
						{selectedCount >= 2 && (
							<button
								type="button"
								className="ws-bar-btn"
								onClick={() => editor?.groupShapes(editor.getSelectedShapeIds())}
								title="Group selected shapes"
							>
								Group
							</button>
						)}
						<button
							type="button"
							className="ws-bar-btn"
							onClick={() => editor?.toggleLock(editor.getSelectedShapeIds())}
							title="Lock / unlock selected shapes"
						>
							Lock
						</button>
					</>
				)}

				<span className="ws-divider" />

				<div className="ws-dropdown-wrap">
					<button
						type="button"
						className="ws-bar-btn"
						onClick={() => setExportMenuOpen((v) => !v)}
					>
						File / Export ▾
					</button>
					{exportMenuOpen && (
						<div className="ws-dropdown" onMouseLeave={() => setExportMenuOpen(false)}>
							<button type="button" onClick={() => void handleExportImage('png')}>
								Export PNG
							</button>
							<button type="button" onClick={() => void handleExportImage('svg')}>
								Export SVG
							</button>
							<button type="button" onClick={handleSaveSnapshot}>
								Save Snapshot (.tldr.json)
							</button>
							<button
								type="button"
								onClick={() => {
									setExportMenuOpen(false)
									fileInputRef.current?.click()
								}}
							>
								Import Snapshot (.json)
							</button>
							<button type="button" onClick={() => void handleCopyDeepLink()}>
								Copy Deep Link
							</button>
							<button type="button" onClick={() => { exportLegacyComments(); setExportMenuOpen(false) }}>Export legacy browser comments</button>
						</div>
					)}
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,.tldr"
						style={{ display: 'none' }}
						onChange={(e) => {
							const file = e.target.files?.[0]
							if (file) void handleImportSnapshot(file)
							e.target.value = ''
						}}
					/>
				</div>

				<span className={`ws-bar-btn ${cloudStatus === 'online' ? 'active sync' : ''}`} title="One shared workspace across signed-in devices">
					{cloudStatus === 'online' ? 'Cloud sync: connected' : `Cloud sync: ${cloudStatus}`}
				</span>

				<button
					type="button"
					className={`ws-bar-btn ws-bar-ai ${isSidebarOpen ? 'active' : ''}`}
					onClick={onToggleSidebar}
				>
					✦ AI paused
				</button>
			</div>

			{toast && <div className="ws-toast">{toast}</div>}
		</header>
	)
}
