import {
	Box,
	createShapeId,
	toRichText,
	type Editor,
	type TLDefaultColorStyle,
	type TLFrameShape,
	type TLNoteShape,
	type TLShapeId,
	type TLTextShape,
} from 'tldraw'

export interface KanbanCardInput {
	text: string
	color?: TLDefaultColorStyle
}

export interface KanbanColumnInput {
	name: string
	color?: TLDefaultColorStyle
	cards: KanbanCardInput[]
}

export interface KanbanBoardInput {
	title?: string
	columns: KanbanColumnInput[]
}

const VALID_COLORS = new Set<TLDefaultColorStyle>([
	'black',
	'grey',
	'light-violet',
	'violet',
	'blue',
	'light-blue',
	'yellow',
	'orange',
	'green',
	'light-green',
	'light-red',
	'red',
	'white',
])

const DEFAULT_COLUMN_COLORS: TLDefaultColorStyle[] = [
	'grey',
	'blue',
	'orange',
	'green',
	'violet',
]

const DEFAULT_CARD_COLORS: TLDefaultColorStyle[] = [
	'yellow',
	'light-blue',
	'light-violet',
	'light-green',
	'light-red',
]

function sanitizeColor(color: unknown, fallback: TLDefaultColorStyle): TLDefaultColorStyle {
	return typeof color === 'string' && VALID_COLORS.has(color as TLDefaultColorStyle)
		? (color as TLDefaultColorStyle)
		: fallback
}

export const KANBAN_PRESETS: Array<{ name: string; board: KanbanBoardInput }> = [
	{
		name: 'Sprint Board',
		board: {
			title: 'Sprint Kanban Board',
			columns: [
				{
					name: 'Backlog',
					color: 'grey',
					cards: [
						{ text: 'Research user onboarding metrics', color: 'yellow' },
						{ text: 'Add dark mode polish', color: 'light-violet' },
					],
				},
				{
					name: 'To Do',
					color: 'blue',
					cards: [
						{ text: 'Design Mermaid export flow', color: 'light-blue' },
						{ text: 'Write API error tests', color: 'yellow' },
					],
				},
				{
					name: 'In Progress',
					color: 'orange',
					cards: [
						{ text: 'Build Gemini canvas assistant', color: 'orange' },
					],
				},
				{
					name: 'Done',
					color: 'green',
					cards: [
						{ text: 'Connect GEMINI_API_KEY secret', color: 'light-green' },
						{ text: 'Enable local board persistence', color: 'light-green' },
					],
				},
			],
		},
	},
	{
		name: 'Product Roadmap',
		board: {
			title: 'Product Roadmap',
			columns: [
				{
					name: 'Now',
					color: 'green',
					cards: [
						{ text: 'AI Whiteboard MVP', color: 'light-green' },
						{ text: 'Mermaid & Kanban workflows', color: 'light-blue' },
					],
				},
				{
					name: 'Next',
					color: 'blue',
					cards: [
						{ text: 'Team multiplayer sync', color: 'yellow' },
						{ text: 'Comment notifications', color: 'light-violet' },
					],
				},
				{
					name: 'Later',
					color: 'grey',
					cards: [
						{ text: 'Custom shape plugins', color: 'yellow' },
					],
				},
			],
		},
	},
]

export function createKanbanBoard(
	editor: Editor,
	input: KanbanBoardInput
): {
	frameIds: TLShapeId[]
	cardIds: TLShapeId[]
	summary: string
} {
	const columns = input.columns.length > 0 ? input.columns : KANBAN_PRESETS[0].board.columns
	const colWidth = 248
	const colGap = 28
	const cardMarginX = 24
	const cardTopPad = 24
	const cardStepY = 216
	const maxCards = Math.max(2, ...columns.map((c) => c.cards.length))
	const colHeight = Math.max(480, cardTopPad + maxCards * cardStepY + 40)

	const totalW = columns.length * colWidth + (columns.length - 1) * colGap
	const vp = editor.getViewportPageBounds()
	let startX = Math.round(vp.x + vp.w / 2 - totalW / 2)
	let startY = Math.round(vp.y + vp.h / 2 - colHeight / 2)

	// Avoid overlapping existing shapes if canvas already has content
	const existingShapes = editor.getCurrentPageShapes()
	if (existingShapes.length > 0) {
		const candidate = new Box(startX, startY, totalW, colHeight)
		const collides = existingShapes.some((s) => {
			const b = editor.getShapePageBounds(s.id)
			return b ? b.collides(candidate) : false
		})
		if (collides) {
			let rightmost = -Infinity
			let topMost = Infinity
			for (const s of existingShapes) {
				const b = editor.getShapePageBounds(s.id)
				if (b) {
					rightmost = Math.max(rightmost, b.maxX)
					topMost = Math.min(topMost, b.y)
				}
			}
			if (Number.isFinite(rightmost) && Number.isFinite(topMost)) {
				startX = Math.round(rightmost + 120)
				startY = Math.round(topMost)
			}
		}
	}

	const frameIds: TLShapeId[] = []
	const cardIds: TLShapeId[] = []

	editor.markHistoryStoppingPoint('create-kanban-board')
	editor.run(() => {
		if (input.title?.trim()) {
			const titleId = createShapeId()
			editor.createShape<TLTextShape>({
				id: titleId,
				type: 'text',
				x: startX,
				y: startY - 58,
				props: {
					color: 'black',
					size: 'xl',
					autoSize: true,
					richText: toRichText(input.title.trim()),
				},
			})
		}

		columns.forEach((col, colIdx) => {
			const frameId = createShapeId()
			const colX = startX + colIdx * (colWidth + colGap)
			const colColor = sanitizeColor(
				col.color,
				DEFAULT_COLUMN_COLORS[colIdx % DEFAULT_COLUMN_COLORS.length]
			)

			editor.createShape<TLFrameShape>({
				id: frameId,
				type: 'frame',
				x: colX,
				y: startY,
				props: {
					w: colWidth,
					h: colHeight,
					name: col.name || `Column ${colIdx + 1}`,
					color: colColor,
				},
			})
			frameIds.push(frameId)

			const columnCardIds: TLShapeId[] = []
			col.cards.forEach((card, cardIdx) => {
				const cardId = createShapeId()
				const defaultCardColor =
					DEFAULT_CARD_COLORS[(colIdx + cardIdx) % DEFAULT_CARD_COLORS.length]
				editor.createShape<TLNoteShape>({
					id: cardId,
					type: 'note',
					x: colX + cardMarginX,
					y: startY + cardTopPad + cardIdx * cardStepY,
					props: {
						color: sanitizeColor(card.color, defaultCardColor),
						size: 's',
						richText: toRichText(card.text),
					},
				})
				columnCardIds.push(cardId)
				cardIds.push(cardId)
			})

			if (columnCardIds.length > 0) {
				editor.reparentShapes(columnCardIds, frameId)
			}
		})
	})

	editor.zoomToBounds(
		new Box(
			startX - 40,
			startY - (input.title ? 90 : 40),
			totalW + 80,
			colHeight + (input.title ? 130 : 80)
		),
		{ animation: { duration: 350 }, inset: 64 }
	)

	const titleLabel = input.title?.trim() ? ` "${input.title.trim()}"` : ''
	return {
		frameIds,
		cardIds,
		summary: `Created Kanban board${titleLabel} (${frameIds.length} columns, ${cardIds.length} cards)`,
	}
}

export function listKanbanColumns(editor: Editor): Array<{ id: TLShapeId; name: string }> {
	return editor
		.getCurrentPageShapes()
		.filter((s): s is TLFrameShape => s.type === 'frame')
		.map((f) => ({ id: f.id, name: f.props.name || 'Untitled Column' }))
}

export function addKanbanCard(
	editor: Editor,
	columnTarget: string,
	text: string,
	color: TLDefaultColorStyle = 'yellow'
): { ok: boolean; cardId?: TLShapeId; summary: string; error?: string } {
	const frames = editor
		.getCurrentPageShapes()
		.filter((s): s is TLFrameShape => s.type === 'frame')

	const targetFrame =
		frames.find((f) => f.id === columnTarget) ??
		frames.find((f) => f.props.name.toLowerCase() === columnTarget.trim().toLowerCase()) ??
		frames.find((f) =>
			f.props.name.toLowerCase().includes(columnTarget.trim().toLowerCase())
		)

	if (!targetFrame) {
		return {
			ok: false,
			summary: `Column "${columnTarget}" not found`,
			error: `No Kanban frame matching "${columnTarget}" exists on this page.`,
		}
	}

	const frameBounds = editor.getShapePageBounds(targetFrame.id)
	if (!frameBounds) {
		return {
			ok: false,
			summary: 'Could not read column bounds',
			error: 'Frame bounds unavailable.',
		}
	}

	const children = editor.getSortedChildIdsForParent(targetFrame.id)
	let nextY = frameBounds.y + 24
	for (const childId of children) {
		const cb = editor.getShapePageBounds(childId)
		if (cb) {
			nextY = Math.max(nextY, cb.maxY + 18)
		}
	}

	const cardId = createShapeId()
	editor.markHistoryStoppingPoint('add-kanban-card')
	editor.run(() => {
		// Auto-grow column frame height if needed
		const neededH = nextY + 224 - frameBounds.y
		if (neededH > targetFrame.props.h) {
			editor.updateShape<TLFrameShape>({
				id: targetFrame.id,
				type: 'frame',
				props: { h: Math.round(neededH) },
			})
		}

		editor.createShape<TLNoteShape>({
			id: cardId,
			type: 'note',
			x: Math.round(frameBounds.x + 24),
			y: Math.round(nextY),
			props: {
				color: sanitizeColor(color, 'yellow'),
				size: 's',
				richText: toRichText(text),
			},
		})
		editor.reparentShapes([cardId], targetFrame.id)
	})

	return {
		ok: true,
		cardId,
		summary: `Added card "${text.slice(0, 36)}" to column "${targetFrame.props.name}"`,
	}
}
