import { useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import {
	SAMPLE_DOCUMENT,
	insertDocumentOnCanvas,
	parseUploadedDocument,
} from './documentUtils'

interface DocumentModalProps {
	editor: Editor | null
	onClose: () => void
}

export function DocumentModal({ editor, onClose }: DocumentModalProps) {
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const [newTitle, setNewTitle] = useState('Untitled Document')
	const [isBusy, setIsBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleUploadFile = async (file: File) => {
		if (!editor) return
		setIsBusy(true)
		setError(null)
		try {
			const parsed = await parseUploadedDocument(file)
			insertDocumentOnCanvas(editor, {
				...parsed,
				enterEditMode: true,
			})
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to import document')
		} finally {
			setIsBusy(false)
		}
	}

	const handleCreateBlank = () => {
		if (!editor) return
		insertDocumentOnCanvas(editor, {
			title: newTitle.trim() || 'Untitled Document',
			html: '<h2>Section 1</h2><p>Start typing your document here…</p>',
			sourceFormat: 'DOC',
			enterEditMode: true,
		})
		onClose()
	}

	const handleLoadSample = () => {
		if (!editor) return
		insertDocumentOnCanvas(editor, {
			...SAMPLE_DOCUMENT,
			enterEditMode: false,
		})
		onClose()
	}

	return (
		<div className="ws-modal-backdrop" onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
			<div className="ws-modal" onClick={(e) => e.stopPropagation()}>
				<div className="ws-modal-header">
					<div>
						<h3>Document Upload &amp; In-Canvas Editor</h3>
						<p>
							Upload Word (.docx), Markdown (.md), HTML, or text files — edit them directly
							on the canvas and export back to MD, HTML, TXT, or PDF.
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
							if (file) void handleUploadFile(file)
						}}
					>
						<strong>{isBusy ? 'Importing document…' : 'Click to upload a document or drag & drop'}</strong>
						<span className="ws-muted">Supports .docx (Word), .md, .txt, .html, .json, .csv</span>
						<input
							ref={fileInputRef}
							type="file"
							accept=".docx,.md,.markdown,.txt,.html,.htm,.json,.csv"
							style={{ display: 'none' }}
							onChange={(e) => {
								const file = e.target.files?.[0]
								if (file) void handleUploadFile(file)
								e.target.value = ''
							}}
						/>
					</div>

					<div className="ws-preset-row">
						<button type="button" className="ws-chip-btn" onClick={handleLoadSample}>
							Insert Sample Architecture Brief
						</button>
					</div>

					<label className="ws-label">
						<span>Or create a new editable document on the canvas</span>
						<div className="ws-reply-row">
							<input
								className="ws-input"
								value={newTitle}
								onChange={(e) => setNewTitle(e.target.value)}
								placeholder="Document title"
								onKeyDown={(e) => {
									if (e.key === 'Enter') handleCreateBlank()
								}}
							/>
							<button
								type="button"
								className="ws-btn ws-btn-primary"
								onClick={handleCreateBlank}
							>
								New Doc
							</button>
						</div>
					</label>

					{error && <div className="ws-error-box">{error}</div>}
				</div>

				<div className="ws-modal-footer">
					<span className="ws-muted">
						Documents persist with your board and can be read &amp; edited by Gemini AI.
					</span>
					<button type="button" className="ws-btn" onClick={onClose}>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
