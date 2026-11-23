import { useState } from 'react'
import type { Editor, TLDefaultColorStyle } from 'tldraw'
import {
	KANBAN_PRESETS,
	addKanbanCard,
	createKanbanBoard,
	listKanbanColumns,
} from './kanbanUtils'

interface KanbanModalProps {
	editor: Editor | null
	onClose: () => void
}

const CARD_COLORS: TLDefaultColorStyle[] = [
	'yellow',
	'light-blue',
	'light-green',
	'light-violet',
	'orange',
	'light-red',
]

export function KanbanModal({ editor, onClose }: KanbanModalProps) {
	const existingColumns = editor ? listKanbanColumns(editor) : []
	const [tab, setTab] = useState<'new' | 'card'>(existingColumns.length > 0 ? 'card' : 'new')

	// New board state
	const [title, setTitle] = useState('Sprint Kanban Board')
	const [columnsText, setColumnsText] = useState('Backlog\nTo Do\nIn Progress\nDone')

	// Add card state
	const [selectedColumnId, setSelectedColumnId] = useState<string>(existingColumns[0]?.id ?? '')
	const [cardText, setCardText] = useState('')
	const [cardColor, setCardColor] = useState<TLDefaultColorStyle>('yellow')
	const [feedback, setFeedback] = useState<string | null>(null)

	const handleCreatePreset = (idx: number) => {
		if (!editor) return
		createKanbanBoard(editor, KANBAN_PRESETS[idx].board)
		onClose()
	}

	const handleCreateCustom = () => {
		if (!editor) return
		const names = columnsText
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
		if (names.length === 0) return

		createKanbanBoard(editor, {
			title: title.trim() || undefined,
			columns: names.map((name, i) => ({
				name,
				cards: i === 0 ? [{ text: 'First task — drag me between columns!' }] : [],
			})),
		})
		onClose()
	}

	const handleAddCard = () => {
		if (!editor || !selectedColumnId || !cardText.trim()) return
		const res = addKanbanCard(editor, selectedColumnId, cardText.trim(), cardColor)
		if (res.ok) {
			setCardText('')
			setFeedback(res.summary)
		} else {
			setFeedback(res.error ?? res.summary)
		}
	}

	return (
		<div className="ws-modal-backdrop" onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
			<div className="ws-modal" onClick={(e) => e.stopPropagation()}>
				<div className="ws-modal-header">
					<div>
						<h3>Kanban Board Builder</h3>
						<p>Native tldraw column frames + draggable sticky-note cards.</p>
					</div>
					<button type="button" className="ws-btn" onClick={onClose}>
						✕
					</button>
				</div>

				<div className="ws-tabs">
					<button
						type="button"
						className={`ws-tab ${tab === 'new' ? 'active' : ''}`}
						onClick={() => setTab('new')}
					>
						New Board
					</button>
					<button
						type="button"
						className={`ws-tab ${tab === 'card' ? 'active' : ''}`}
						onClick={() => setTab('card')}
					>
						Add Card ({existingColumns.length} columns)
					</button>
				</div>

				{tab === 'new' ? (
					<div className="ws-modal-body">
						<div className="ws-preset-row">
							{KANBAN_PRESETS.map((preset, idx) => (
								<button
									key={preset.name}
									type="button"
									className="ws-chip-btn"
									onClick={() => handleCreatePreset(idx)}
								>
									Insert {preset.name}
								</button>
							))}
						</div>

						<label className="ws-label">
							<span>Board Title</span>
							<input
								className="ws-input"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</label>

						<label className="ws-label">
							<span>Columns (one per line)</span>
							<textarea
								className="ws-textarea"
								rows={5}
								value={columnsText}
								onChange={(e) => setColumnsText(e.target.value)}
							/>
						</label>

						<div className="ws-modal-footer">
							<span className="ws-muted">Drag cards across frames to move status.</span>
							<div className="ws-footer-actions">
								<button type="button" className="ws-btn" onClick={onClose}>
									Cancel
								</button>
								<button
									type="button"
									className="ws-btn ws-btn-primary"
									onClick={handleCreateCustom}
								>
									Create Board
								</button>
							</div>
						</div>
					</div>
				) : (
					<div className="ws-modal-body">
						{existingColumns.length === 0 ? (
							<p className="ws-muted">
								No Kanban column frames on this page yet. Create a new board first!
							</p>
						) : (
							<>
								<label className="ws-label">
									<span>Target Column</span>
									<select
										className="ws-input"
										value={selectedColumnId}
										onChange={(e) => setSelectedColumnId(e.target.value)}
									>
										{existingColumns.map((c) => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</select>
								</label>

								<label className="ws-label">
									<span>Card Text</span>
									<textarea
										className="ws-textarea"
										rows={3}
										value={cardText}
										onChange={(e) => setCardText(e.target.value)}
										placeholder="Describe the task…"
									/>
								</label>

								<label className="ws-label">
									<span>Card Color</span>
									<div className="ws-color-row">
										{CARD_COLORS.map((c) => (
											<button
												key={c}
												type="button"
												className={`ws-chip-btn ${cardColor === c ? 'active' : ''}`}
												onClick={() => setCardColor(c)}
											>
												{c}
											</button>
										))}
									</div>
								</label>

								{feedback && <div className="ws-success-box">{feedback}</div>}

								<div className="ws-modal-footer">
									<span className="ws-muted">Drops neatly below existing cards.</span>
									<div className="ws-footer-actions">
										<button type="button" className="ws-btn" onClick={onClose}>
											Done
										</button>
										<button
											type="button"
											className="ws-btn ws-btn-primary"
											disabled={!cardText.trim()}
											onClick={handleAddCard}
										>
											Add Card
										</button>
									</div>
								</div>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
