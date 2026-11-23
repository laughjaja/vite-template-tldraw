import { useEffect, useRef } from 'react'
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	T,
	useIsEditing,
	type RecordProps,
	type TLShape,
} from 'tldraw'
import {
	exportDocumentAsHtml,
	exportDocumentAsMarkdown,
	exportDocumentAsPdf,
	exportDocumentAsText,
	htmlToPlaintext,
} from './documentUtils'

declare module '@tldraw/tlschema' {
	export interface TLGlobalShapePropsMap {
		document: {
			w: number
			h: number
			title: string
			html: string
			sourceFormat: string
		}
	}
}

export type DocumentShape = TLShape<'document'>

function DocumentShapeView({
	shape,
	util,
}: {
	shape: DocumentShape
	util: DocumentShapeUtil
}) {
	const isEditing = useIsEditing(shape.id)
	const editorRef = useRef<HTMLDivElement | null>(null)
	const lastSavedHtmlRef = useRef<string>(shape.props.html)

	// Keep DOM content synced with external/AI updates when not actively typing
	useEffect(() => {
		const el = editorRef.current
		if (!el) return
		if (!isEditing || shape.props.html !== lastSavedHtmlRef.current) {
			if (el.innerHTML !== shape.props.html) {
				el.innerHTML = shape.props.html
			}
			lastSavedHtmlRef.current = shape.props.html
		}
	}, [shape.props.html, isEditing])

	useEffect(() => {
		if (isEditing && editorRef.current) {
			editorRef.current.focus()
		}
	}, [isEditing])

	const persistHtml = () => {
		const el = editorRef.current
		if (!el) return
		const nextHtml = el.innerHTML
		if (nextHtml === lastSavedHtmlRef.current) return
		lastSavedHtmlRef.current = nextHtml
		util.editor.updateShape<DocumentShape>({
			id: shape.id,
			type: 'document',
			props: { html: nextHtml },
		})
	}

	const runFormat = (command: string, value?: string) => {
		if (!editorRef.current) return
		editorRef.current.focus()
		document.execCommand(command, false, value)
		persistHtml()
	}

	const wordCount = htmlToPlaintext(shape.props.html)
		.split(/\s+/)
		.filter(Boolean).length

	return (
		<HTMLContainer
			id={shape.id}
			className={`doc-shape ${isEditing ? 'is-editing' : ''}`}
			style={{
				width: shape.props.w,
				height: shape.props.h,
				pointerEvents: 'all',
			}}
		>
			<div
				className="doc-shape-header"
				onPointerDown={(e) => {
					if ((e.target as HTMLElement).closest('button, input')) {
						e.stopPropagation()
					}
				}}
			>
				<span className="doc-format-badge">{shape.props.sourceFormat || 'DOC'}</span>

				{isEditing ? (
					<input
						className="doc-title-input"
						value={shape.props.title}
						onChange={(e) =>
							util.editor.updateShape<DocumentShape>({
								id: shape.id,
								type: 'document',
								props: { title: e.target.value },
							})
						}
						onKeyDown={(e) => e.stopPropagation()}
					/>
				) : (
					<span className="doc-title-text" title={shape.props.title}>
						{shape.props.title || 'Untitled Document'}
					</span>
				)}

				<div className="doc-header-actions">
					<span className="doc-word-count">{wordCount}w</span>
					<button
						type="button"
						className={`doc-mini-btn ${isEditing ? 'primary' : ''}`}
						onClick={(e) => {
							e.stopPropagation()
							if (isEditing) {
								persistHtml()
								util.editor.setEditingShape(null)
							} else {
								util.editor.select(shape.id)
								util.editor.setEditingShape(shape.id)
							}
						}}
					>
						{isEditing ? 'Done' : 'Edit'}
					</button>
					<button
						type="button"
						className="doc-mini-btn"
						title="Export Markdown (.md)"
						onClick={(e) => {
							e.stopPropagation()
							exportDocumentAsMarkdown(shape.props.title, shape.props.html)
						}}
					>
						MD
					</button>
					<button
						type="button"
						className="doc-mini-btn"
						title="Export HTML (.html)"
						onClick={(e) => {
							e.stopPropagation()
							exportDocumentAsHtml(shape.props.title, shape.props.html)
						}}
					>
						HTML
					</button>
					<button
						type="button"
						className="doc-mini-btn"
						title="Export Text (.txt)"
						onClick={(e) => {
							e.stopPropagation()
							exportDocumentAsText(shape.props.title, shape.props.html)
						}}
					>
						TXT
					</button>
					<button
						type="button"
						className="doc-mini-btn"
						title="Export PDF (.pdf)"
						onClick={(e) => {
							e.stopPropagation()
							void exportDocumentAsPdf(shape.props.title, shape.props.html)
						}}
					>
						PDF
					</button>
				</div>
			</div>

			{isEditing && (
				<div
					className="doc-format-bar"
					onPointerDown={(e) => {
						e.preventDefault()
						e.stopPropagation()
					}}
				>
					<button type="button" onClick={() => runFormat('bold')} title="Bold">
						<strong>B</strong>
					</button>
					<button type="button" onClick={() => runFormat('italic')} title="Italic">
						<em>I</em>
					</button>
					<button type="button" onClick={() => runFormat('underline')} title="Underline">
						<u>U</u>
					</button>
					<button type="button" onClick={() => runFormat('formatBlock', 'h1')} title="Heading 1">
						H1
					</button>
					<button type="button" onClick={() => runFormat('formatBlock', 'h2')} title="Heading 2">
						H2
					</button>
					<button type="button" onClick={() => runFormat('formatBlock', 'p')} title="Paragraph">
						P
					</button>
					<button type="button" onClick={() => runFormat('insertUnorderedList')} title="Bullet List">
						• List
					</button>
					<button type="button" onClick={() => runFormat('insertOrderedList')} title="Numbered List">
						1. List
					</button>
					<button
						type="button"
						onClick={() => runFormat('formatBlock', 'blockquote')}
						title="Quote"
					>
						“Quote”
					</button>
					<button type="button" onClick={() => runFormat('removeFormat')} title="Clear formatting">
						Clear
					</button>
				</div>
			)}

			<div
				ref={editorRef}
				className="doc-shape-body"
				contentEditable={isEditing}
				suppressContentEditableWarning
				onInput={persistHtml}
				onBlur={persistHtml}
				onPointerDown={(e) => {
					if (isEditing) e.stopPropagation()
				}}
				onWheel={(e) => {
					if (isEditing) e.stopPropagation()
				}}
				onKeyDown={(e) => {
					if (isEditing) {
						e.stopPropagation()
						if (e.key === 'Escape') {
							persistHtml()
							util.editor.setEditingShape(null)
						}
					}
				}}
				onDoubleClick={(e) => {
					if (!isEditing) {
						e.stopPropagation()
						util.editor.select(shape.id)
						util.editor.setEditingShape(shape.id)
					}
				}}
			/>

			{!isEditing && (
				<div className="doc-shape-footer">Double-click or click Edit to edit inside canvas</div>
			)}
		</HTMLContainer>
	)
}

export class DocumentShapeUtil extends BaseBoxShapeUtil<DocumentShape> {
	static override type = 'document' as const
	static override props: RecordProps<DocumentShape> = {
		w: T.number,
		h: T.number,
		title: T.string,
		html: T.string,
		sourceFormat: T.string,
	}

	override canEdit() {
		return true
	}

	override getDefaultProps(): DocumentShape['props'] {
		return {
			w: 640,
			h: 520,
			title: 'Untitled Document',
			html: '<p>Start writing…</p>',
			sourceFormat: 'DOC',
		}
	}

	override component(shape: DocumentShape) {
		return <DocumentShapeView shape={shape} util={this} />
	}

	override getIndicatorPath(shape: DocumentShape) {
		const path = new Path2D()
		if (typeof path.roundRect === 'function') {
			path.roundRect(0, 0, shape.props.w, shape.props.h, 10)
		} else {
			path.rect(0, 0, shape.props.w, shape.props.h)
		}
		return path
	}
}
