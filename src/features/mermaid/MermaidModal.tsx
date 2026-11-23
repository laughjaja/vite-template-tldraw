import { useEffect, useState } from 'react'
import type { Editor, TLShapeId } from 'tldraw'
import { buildFlowchartOnCanvas } from '../../agent/executeActions'
import {
	MERMAID_PRESETS,
	insertMermaidAsSvgShape,
	parseMermaidFlowchart,
	renderMermaidSvg,
} from './mermaidUtils'

interface MermaidModalProps {
	editor: Editor | null
	onClose: () => void
}

export function MermaidModal({ editor, onClose }: MermaidModalProps) {
	const [code, setCode] = useState(MERMAID_PRESETS[0].code)
	const [title, setTitle] = useState('Mermaid Diagram')
	const [previewSvg, setPreviewSvg] = useState<string>('')
	const [previewError, setPreviewError] = useState<string | null>(null)
	const [isInserting, setIsInserting] = useState(false)

	const parsedFlowchart = parseMermaidFlowchart(code)

	useEffect(() => {
		let cancelled = false
		const timer = window.setTimeout(async () => {
			if (!code.trim()) {
				setPreviewSvg('')
				setPreviewError(null)
				return
			}
			try {
				const { svg } = await renderMermaidSvg(code)
				if (!cancelled) {
					setPreviewSvg(svg)
					setPreviewError(null)
				}
			} catch (err) {
				if (!cancelled) {
					setPreviewError(err instanceof Error ? err.message : String(err))
				}
			}
		}, 250)

		return () => {
			cancelled = true
			window.clearTimeout(timer)
		}
	}, [code])

	const handleInsertEditable = () => {
		if (!editor || !parsedFlowchart) return
		const refMap = new Map<string, TLShapeId>()
		editor.markHistoryStoppingPoint('insert-mermaid-editable')
		editor.run(() => {
			buildFlowchartOnCanvas(
				editor,
				{
					title: title.trim() || undefined,
					direction: parsedFlowchart.direction,
					nodes: parsedFlowchart.nodes,
					edges: parsedFlowchart.edges,
				},
				refMap
			)
		})
		onClose()
	}

	const handleInsertSvg = async () => {
		if (!editor || !code.trim()) return
		setIsInserting(true)
		try {
			await insertMermaidAsSvgShape(editor, code, title.trim() || undefined)
			onClose()
		} catch (err) {
			setPreviewError(err instanceof Error ? err.message : String(err))
		} finally {
			setIsInserting(false)
		}
	}

	return (
		<div className="ws-modal-backdrop" onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
			<div className="ws-modal ws-modal-wide" onClick={(e) => e.stopPropagation()}>
				<div className="ws-modal-header">
					<div>
						<h3>Mermaid Diagram Studio</h3>
						<p>Write or paste Mermaid syntax, preview live, and insert onto your canvas.</p>
					</div>
					<button type="button" className="ws-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="ws-preset-row">
					{MERMAID_PRESETS.map((preset) => (
						<button
							key={preset.name}
							type="button"
							className="ws-chip-btn"
							onClick={() => {
								setCode(preset.code)
								setTitle(preset.name)
							}}
						>
							{preset.name}
						</button>
					))}
				</div>

				<div className="ws-field-row">
					<label className="ws-label">
						<span>Title</span>
						<input
							className="ws-input"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Diagram title"
						/>
					</label>
				</div>

				<div className="ws-mermaid-grid">
					<div className="ws-mermaid-pane">
						<div className="ws-pane-label">Mermaid Source</div>
						<textarea
							className="ws-code-textarea"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							spellCheck={false}
						/>
					</div>
					<div className="ws-mermaid-pane">
						<div className="ws-pane-label">Live Preview</div>
						<div className="ws-mermaid-preview">
							{previewError ? (
								<div className="ws-error-box">{previewError}</div>
							) : previewSvg ? (
								<div dangerouslySetInnerHTML={{ __html: previewSvg }} />
							) : (
								<span className="ws-muted">Enter Mermaid syntax to preview…</span>
							)}
						</div>
					</div>
				</div>

				<div className="ws-modal-footer">
					<span className="ws-muted">
						{parsedFlowchart
							? `Flowchart detected (${parsedFlowchart.nodes.length} nodes, ${parsedFlowchart.edges.length} edges) — can insert as editable shapes!`
							: 'Sequence, ER, State, Mindmap & Gantt diagrams insert as crisp lossless SVG.'}
					</span>
					<div className="ws-footer-actions">
						<button type="button" className="ws-btn" onClick={onClose}>
							Cancel
						</button>
						<button
							type="button"
							className="ws-btn"
							disabled={!editor || !code.trim() || Boolean(previewError) || isInserting}
							onClick={() => void handleInsertSvg()}
						>
							{isInserting ? 'Rendering…' : 'Insert as SVG'}
						</button>
						{parsedFlowchart && (
							<button
								type="button"
								className="ws-btn ws-btn-primary"
								disabled={!editor}
								onClick={handleInsertEditable}
							>
								Insert Editable Shapes
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
