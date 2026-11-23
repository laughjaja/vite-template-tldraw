import { useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import {
	createSamplePdfBytes,
	exportAnnotatedPdf,
	loadPdfOnCanvas,
	type PdfDocumentSession,
} from './pdfEditorUtils'

interface PdfEditorModalProps {
	editor: Editor | null
	activePdf: PdfDocumentSession | null
	onPdfChange: (session: PdfDocumentSession | null) => void
	onClose: () => void
}

export function PdfEditorModal({
	editor,
	activePdf,
	onPdfChange,
	onClose,
}: PdfEditorModalProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [statusText, setStatusText] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)

	const handlePdfFile = async (file: File) => {
		if (!editor) return
		setError(null)
		setStatusText('Loading PDF…')
		try {
			const bytes = new Uint8Array(await file.arrayBuffer())
			const session = await loadPdfOnCanvas(editor, { name: file.name, bytes }, setStatusText)
			onPdfChange(session)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load PDF')
		} finally {
			setStatusText(null)
		}
	}

	const handleLoadSample = async () => {
		if (!editor) return
		setError(null)
		setStatusText('Generating 2-page sample PDF…')
		try {
			const bytes = await createSamplePdfBytes()
			const session = await loadPdfOnCanvas(
				editor,
				{ name: 'sample-review.pdf', bytes },
				setStatusText
			)
			onPdfChange(session)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create sample PDF')
		} finally {
			setStatusText(null)
		}
	}

	const handleExport = async () => {
		if (!editor || !activePdf) return
		setError(null)
		setStatusText('Preparing annotated PDF…')
		try {
			await exportAnnotatedPdf(editor, activePdf, setStatusText)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to export PDF')
		} finally {
			setStatusText(null)
		}
	}

	return (
		<div className="ws-modal-backdrop" onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
			<div className="ws-modal" onClick={(e) => e.stopPropagation()}>
				<div className="ws-modal-header">
					<div>
						<h3>PDF Editor &amp; Annotator</h3>
						<p>
							Open any PDF onto locked canvas pages, annotate with tldraw drawing tools,
							and export back to a real PDF file.
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
							if (file && file.name.toLowerCase().endsWith('.pdf')) {
								void handlePdfFile(file)
							}
						}}
					>
						<strong>Click to open a PDF or drag &amp; drop here</strong>
						<span className="ws-muted">Rendered locally in your browser via pdf.js</span>
						<input
							ref={fileInputRef}
							type="file"
							accept="application/pdf,.pdf"
							style={{ display: 'none' }}
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) void handlePdfFile(file)
								e.target.value = ''
							}}
						/>
					</div>

					<div className="ws-preset-row">
						<button
							type="button"
							className="ws-chip-btn"
							disabled={Boolean(statusText)}
							onClick={() => void handleLoadSample()}
						>
							Load 2-Page Sample PDF
						</button>
					</div>

					{activePdf && (
						<div className="ws-session-card">
							<div>
								<strong>Active PDF:</strong> {activePdf.name} ({activePdf.pages.length}{' '}
								{activePdf.pages.length === 1 ? 'page' : 'pages'})
							</div>
							<div className="ws-footer-actions">
								<button
									type="button"
									className="ws-btn ws-btn-primary"
									disabled={Boolean(statusText)}
									onClick={() => void handleExport()}
								>
									Export Annotated PDF
								</button>
							</div>
						</div>
					)}

					{statusText && <div className="ws-success-box">{statusText}</div>}
					{error && <div className="ws-error-box">{error}</div>}
				</div>

				<div className="ws-modal-footer">
					<span className="ws-muted">Powered by pdfjs-dist + pdf-lib on native tldraw pages.</span>
					<button type="button" className="ws-btn" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
