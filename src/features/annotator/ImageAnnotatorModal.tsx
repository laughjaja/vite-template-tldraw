import { useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import {
	createSampleAnnotationImageDataUrl,
	exportAnnotatedImage,
	loadImageForAnnotation,
	type AnnotatedImageSession,
} from './imageAnnotatorUtils'

interface ImageAnnotatorModalProps {
	editor: Editor | null
	activeSession: AnnotatedImageSession | null
	onSessionChange: (session: AnnotatedImageSession | null) => void
	onClose: () => void
}

export function ImageAnnotatorModal({
	editor,
	activeSession,
	onSessionChange,
	onClose,
}: ImageAnnotatorModalProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [isBusy, setIsBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleFile = async (file: File) => {
		if (!editor) return
		setIsBusy(true)
		setError(null)
		try {
			const session = await loadImageForAnnotation(editor, file)
			onSessionChange(session)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load image')
		} finally {
			setIsBusy(false)
		}
	}

	const handleLoadSample = async () => {
		if (!editor) return
		setIsBusy(true)
		setError(null)
		try {
			const dataUrl = createSampleAnnotationImageDataUrl()
			const session = await loadImageForAnnotation(editor, {
				dataUrl,
				name: 'sample-dashboard-mockup.png',
				mimeType: 'image/png',
			})
			onSessionChange(session)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load sample image')
		} finally {
			setIsBusy(false)
		}
	}

	const handleExport = async () => {
		if (!editor || !activeSession) return
		setIsBusy(true)
		setError(null)
		try {
			await exportAnnotatedImage(editor, activeSession)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to export image')
		} finally {
			setIsBusy(false)
		}
	}

	return (
		<div className="ws-modal-backdrop" onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
			<div className="ws-modal" onClick={(e) => e.stopPropagation()}>
				<div className="ws-modal-header">
					<div>
						<h3>Image Annotator</h3>
						<p>
							Load any image as a locked canvas layer, draw/highlight/callout on top, and
							export a cropped annotated PNG.
						</p>
					</div>
					<button type="button" className="ws-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="ws-modal-body">
					<div
						className="ws-dropzone"
						onClick={() => fileInputRef.current?.click()}
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => {
							e.preventDefault()
							const file = e.dataTransfer.files?.[0]
							if (file && file.type.startsWith('image/')) {
								void handleFile(file)
							}
						}}
					>
						<strong>Click to upload an image or drag &amp; drop here</strong>
						<span className="ws-muted">Supports PNG, JPG, WebP, GIF, and SVG</span>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) void handleFile(file)
								e.target.value = ''
							}}
						/>
					</div>

					<div className="ws-preset-row">
						<button
							type="button"
							className="ws-chip-btn"
							disabled={isBusy}
							onClick={() => void handleLoadSample()}
						>
							Load Sample UI Mockup
						</button>
					</div>

					{activeSession && (
						<div className="ws-session-card">
							<div>
								<strong>Active Image:</strong> {activeSession.name} ({activeSession.width}×
								{activeSession.height})
							</div>
							<div className="ws-footer-actions">
								<button
									type="button"
									className="ws-btn"
									onClick={() => {
										if (editor) {
											const shape = editor.getShape(activeSession.shapeId)
											if (shape) editor.toggleLock([shape.id])
										}
									}}
								>
									Toggle Lock
								</button>
								<button
									type="button"
									className="ws-btn ws-btn-primary"
									disabled={isBusy}
									onClick={() => void handleExport()}
								>
									Export Annotated PNG
								</button>
							</div>
						</div>
					)}

					{error && <div className="ws-error-box">{error}</div>}
				</div>

				<div className="ws-modal-footer">
					<span className="ws-muted">Base image stays locked underneath your annotations.</span>
					<button type="button" className="ws-btn" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
