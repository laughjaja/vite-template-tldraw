import {
	Box,
	createBindingId,
	createShapeId,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLArrowShape,
	type TLArrowShapeArrowheadStyle,
	type TLArrowShapeKind,
	type TLDefaultColorStyle,
	type TLDefaultDashStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
	type TLEmbedShape,
	type TLFrameShape,
	type TLGeoShape,
	type TLGeoShapeGeoStyle,
	type TLNoteShape,
	type TLPageId,
	type TLShapeId,
	type TLTextShape,
} from 'tldraw'
import type { AgentToolCall, AgentToolResult } from '../../shared/agentTypes'
import type { DocumentShape } from '../features/document/DocumentShapeUtil'
import {
	insertDocumentOnCanvas,
	markdownToHtml,
	sanitizeDocumentHtml,
} from '../features/document/documentUtils'
import {
	addKanbanCard,
	createKanbanBoard,
	type KanbanColumnInput,
} from '../features/kanban/kanbanUtils'
import {
	insertMermaidAsSvgShape,
	parseMermaidFlowchart,
} from '../features/mermaid/mermaidUtils'

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

const VALID_FILLS = new Set<TLDefaultFillStyle>(['none', 'semi', 'solid', 'pattern', 'fill'])
const VALID_SIZES = new Set<TLDefaultSizeStyle>(['s', 'm', 'l', 'xl'])
const VALID_DASHES = new Set<TLDefaultDashStyle>(['draw', 'solid', 'dashed', 'dotted'])
const VALID_GEOS = new Set<TLGeoShapeGeoStyle>([
	'cloud',
	'rectangle',
	'ellipse',
	'triangle',
	'diamond',
	'pentagon',
	'hexagon',
	'octagon',
	'star',
	'rhombus',
	'rhombus-2',
	'oval',
	'trapezoid',
	'arrow-right',
	'arrow-left',
	'arrow-up',
	'arrow-down',
	'x-box',
	'check-box',
	'heart',
])
const VALID_ARROWHEADS = new Set<TLArrowShapeArrowheadStyle>([
	'arrow',
	'triangle',
	'square',
	'dot',
	'pipe',
	'diamond',
	'inverted',
	'bar',
	'none',
])

function asColor(value: unknown, fallback: TLDefaultColorStyle = 'black'): TLDefaultColorStyle {
	return typeof value === 'string' && VALID_COLORS.has(value as TLDefaultColorStyle)
		? (value as TLDefaultColorStyle)
		: fallback
}

function asFill(value: unknown, fallback: TLDefaultFillStyle = 'semi'): TLDefaultFillStyle {
	return typeof value === 'string' && VALID_FILLS.has(value as TLDefaultFillStyle)
		? (value as TLDefaultFillStyle)
		: fallback
}

function asSize(value: unknown, fallback: TLDefaultSizeStyle = 'm'): TLDefaultSizeStyle {
	return typeof value === 'string' && VALID_SIZES.has(value as TLDefaultSizeStyle)
		? (value as TLDefaultSizeStyle)
		: fallback
}

function asDash(value: unknown, fallback: TLDefaultDashStyle = 'solid'): TLDefaultDashStyle {
	return typeof value === 'string' && VALID_DASHES.has(value as TLDefaultDashStyle)
		? (value as TLDefaultDashStyle)
		: fallback
}

function asGeo(value: unknown, fallback: TLGeoShapeGeoStyle = 'rectangle'): TLGeoShapeGeoStyle {
	return typeof value === 'string' && VALID_GEOS.has(value as TLGeoShapeGeoStyle)
		? (value as TLGeoShapeGeoStyle)
		: fallback
}

function asArrowKind(value: unknown, fallback: TLArrowShapeKind = 'arc'): TLArrowShapeKind {
	return value === 'elbow' || value === 'arc' ? value : fallback
}

function asArrowhead(
	value: unknown,
	fallback: TLArrowShapeArrowheadStyle
): TLArrowShapeArrowheadStyle {
	return typeof value === 'string' && VALID_ARROWHEADS.has(value as TLArrowShapeArrowheadStyle)
		? (value as TLArrowShapeArrowheadStyle)
		: fallback
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

function resolveShapeId(
	editor: Editor,
	rawId: unknown,
	refMap: Map<string, TLShapeId>
): TLShapeId | undefined {
	if (typeof rawId !== 'string' || !rawId.trim()) return undefined
	const mapped = refMap.get(rawId)
	if (mapped && editor.getShape(mapped)) return mapped
	const direct = rawId as TLShapeId
	if (editor.getShape(direct)) return direct
	if (!rawId.startsWith('shape:')) {
		const prefixed = `shape:${rawId}` as TLShapeId
		if (editor.getShape(prefixed)) return prefixed
	}
	return undefined
}

function resolveTargetShapeIds(
	editor: Editor,
	args: Record<string, unknown>,
	refMap: Map<string, TLShapeId>
): TLShapeId[] {
	if (args.useSelected === true) {
		return [...editor.getSelectedShapeIds()]
	}
	const rawIds = Array.isArray(args.shapeIds) ? args.shapeIds : []
	const resolved: TLShapeId[] = []
	for (const raw of rawIds) {
		const id = resolveShapeId(editor, raw, refMap)
		if (id) resolved.push(id)
	}
	if (resolved.length === 0 && rawIds.length === 0) {
		return [...editor.getSelectedShapeIds()]
	}
	return resolved
}

function getSmartPlacementCenter(editor: Editor): { x: number; y: number } {
	const vp = editor.getViewportPageBounds()
	return {
		x: Math.round(vp.x + vp.w / 2),
		y: Math.round(vp.y + vp.h / 2),
	}
}

function createBoundConnector(
	editor: Editor,
	opts: {
		fromShapeId?: TLShapeId
		toShapeId?: TLShapeId
		startX?: number
		startY?: number
		endX?: number
		endY?: number
		label?: string
		color?: TLDefaultColorStyle
		kind?: TLArrowShapeKind
		dash?: TLDefaultDashStyle
		arrowheadStart?: TLArrowShapeArrowheadStyle
		arrowheadEnd?: TLArrowShapeArrowheadStyle
	}
): TLShapeId {
	const fromBounds = opts.fromShapeId ? editor.getShapePageBounds(opts.fromShapeId) : null
	const toBounds = opts.toShapeId ? editor.getShapePageBounds(opts.toShapeId) : null
	const center = getSmartPlacementCenter(editor)

	const startPt = fromBounds
		? { x: fromBounds.midX, y: fromBounds.midY }
		: { x: opts.startX ?? center.x - 80, y: opts.startY ?? center.y }

	const endPt = toBounds
		? { x: toBounds.midX, y: toBounds.midY }
		: { x: opts.endX ?? startPt.x + 160, y: opts.endY ?? startPt.y }

	const arrowId = createShapeId()
	const labelText = opts.label?.trim() ?? ''

	editor.createShape<TLArrowShape>({
		id: arrowId,
		type: 'arrow',
		x: startPt.x,
		y: startPt.y,
		props: {
			kind: opts.kind ?? 'arc',
			color: opts.color ?? 'black',
			labelColor: 'black',
			dash: opts.dash ?? 'solid',
			size: 'm',
			arrowheadStart: opts.arrowheadStart ?? 'none',
			arrowheadEnd: opts.arrowheadEnd ?? 'arrow',
			start: { x: 0, y: 0 },
			end: { x: endPt.x - startPt.x, y: endPt.y - startPt.y },
			richText: toRichText(labelText),
		},
	})

	const bindings: Array<Omit<TLArrowBinding, 'typeName' | 'meta'> & { meta?: Record<string, never> }> = []
	if (opts.fromShapeId) {
		bindings.push({
			id: createBindingId(),
			type: 'arrow',
			fromId: arrowId,
			toId: opts.fromShapeId,
			props: {
				terminal: 'start',
				normalizedAnchor: { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: false,
				snap: 'none',
			},
		})
	}
	if (opts.toShapeId) {
		bindings.push({
			id: createBindingId(),
			type: 'arrow',
			fromId: arrowId,
			toId: opts.toShapeId,
			props: {
				terminal: 'end',
				normalizedAnchor: { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: false,
				snap: 'none',
			},
		})
	}

	if (bindings.length > 0) {
		editor.createBindings(bindings)
	}

	return arrowId
}

function handleCreateShape(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	const kind = asString(args.kind) ?? 'geo'
	const text = asString(args.text) ?? ''
	const refId = asString(args.refId)
	const center = getSmartPlacementCenter(editor)
	const id = createShapeId()

	if (kind === 'text') {
		const w = asNumber(args.w)
		const x = asNumber(args.x) ?? center.x - 90
		const y = asNumber(args.y) ?? center.y - 16
		editor.createShape<TLTextShape>({
			id,
			type: 'text',
			x,
			y,
			props: {
				color: asColor(args.color, 'black'),
				size: asSize(args.size, 'm'),
				autoSize: w === undefined,
				...(w !== undefined ? { w: Math.max(40, w) } : {}),
				richText: toRichText(text || 'Text'),
			},
		})
	} else if (kind === 'note') {
		const x = asNumber(args.x) ?? center.x - 100
		const y = asNumber(args.y) ?? center.y - 100
		editor.createShape<TLNoteShape>({
			id,
			type: 'note',
			x,
			y,
			props: {
				color: asColor(args.color, 'yellow'),
				size: asSize(args.size, 'm'),
				richText: toRichText(text),
			},
		})
	} else if (kind === 'frame') {
		const w = Math.max(160, asNumber(args.w) ?? 480)
		const h = Math.max(120, asNumber(args.h) ?? 320)
		const x = asNumber(args.x) ?? center.x - w / 2
		const y = asNumber(args.y) ?? center.y - h / 2
		editor.createShape<TLFrameShape>({
			id,
			type: 'frame',
			x,
			y,
			props: {
				w,
				h,
				name: text || 'Frame',
				color: asColor(args.color, 'black'),
			},
		})
	} else {
		const geo = asGeo(args.geo, 'rectangle')
		const defaultW = geo === 'diamond' ? 190 : 200
		const defaultH = geo === 'diamond' ? 110 : 84
		const w = Math.max(48, asNumber(args.w) ?? defaultW)
		const h = Math.max(40, asNumber(args.h) ?? defaultH)
		const x = asNumber(args.x) ?? center.x - w / 2
		const y = asNumber(args.y) ?? center.y - h / 2
		editor.createShape<TLGeoShape>({
			id,
			type: 'geo',
			x,
			y,
			props: {
				geo,
				w,
				h,
				color: asColor(args.color, 'black'),
				fill: asFill(args.fill, 'semi'),
				size: asSize(args.size, 'm'),
				richText: toRichText(text),
			},
		})
	}

	if (refId) {
		refMap.set(refId, id)
	}

	const labelSuffix = text ? ` "${text.slice(0, 40)}"` : ''
	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Created ${kind === 'geo' ? asGeo(args.geo, 'rectangle') : kind}${labelSuffix}`,
		createdIds: { [refId ?? id]: id },
		affectedIds: [id],
	}
}

function handleCreateConnector(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	const fromShapeId = resolveShapeId(editor, args.fromId, refMap)
	const toShapeId = resolveShapeId(editor, args.toId, refMap)

	if (args.fromId && !fromShapeId) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: `Source shape "${String(args.fromId)}" not found`,
			error: `Could not find shape with id/refId "${String(args.fromId)}".`,
		}
	}
	if (args.toId && !toShapeId) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: `Target shape "${String(args.toId)}" not found`,
			error: `Could not find shape with id/refId "${String(args.toId)}".`,
		}
	}

	const label = asString(args.label)
	const arrowId = createBoundConnector(editor, {
		fromShapeId,
		toShapeId,
		startX: asNumber(args.startX),
		startY: asNumber(args.startY),
		endX: asNumber(args.endX),
		endY: asNumber(args.endY),
		label,
		color: asColor(args.color, 'black'),
		kind: asArrowKind(args.kind, 'arc'),
		dash: asDash(args.dash, 'solid'),
		arrowheadStart: asArrowhead(args.arrowheadStart, 'none'),
		arrowheadEnd: asArrowhead(args.arrowheadEnd, 'arrow'),
	})

	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: label ? `Connected shapes with arrow "${label}"` : 'Created connector arrow',
		createdIds: { arrow: arrowId },
		affectedIds: [arrowId],
	}
}

export interface FlowchartNodeInput {
	refId: string
	label: string
	shape?: string
	color?: string
	fill?: string
}

export interface FlowchartEdgeInput {
	from: string
	to: string
	label?: string
	color?: string
}

function computeNodeDimensions(node: FlowchartNodeInput): { w: number; h: number } {
	const label = node.label ?? ''
	const lines = label.split('\n')
	const longestLine = Math.max(...lines.map((l) => l.length), 8)
	const estimatedWidth = Math.min(280, Math.max(168, longestLine * 9.5 + 44))
	const wrappedLines = Math.max(lines.length, Math.ceil(label.length / 22))

	if (node.shape === 'diamond') {
		return {
			w: Math.max(190, Math.round(estimatedWidth * 1.1)),
			h: Math.max(110, wrappedLines * 28 + 64),
		}
	}
	if (node.shape === 'note') {
		return { w: 200, h: 200 }
	}
	return {
		w: Math.round(estimatedWidth),
		h: Math.max(72, wrappedLines * 26 + 34),
	}
}

export function buildFlowchartOnCanvas(
	editor: Editor,
	opts: {
		title?: string
		frameName?: string
		direction?: 'vertical' | 'horizontal'
		arrowKind?: TLArrowShapeKind
		nodes: FlowchartNodeInput[]
		edges: FlowchartEdgeInput[]
	},
	refMap: Map<string, TLShapeId>
): {
	ok: boolean
	summary: string
	createdIds?: Record<string, string>
	affectedIds?: string[]
	error?: string
} {
	const rawNodes = opts.nodes
	const rawEdges = opts.edges
	const direction = opts.direction === 'horizontal' ? 'horizontal' : 'vertical'
	const arrowKind = opts.arrowKind ?? 'arc'
	const title = opts.title?.trim()
	const frameName = opts.frameName?.trim()

	if (rawNodes.length === 0) {
		return {
			ok: false,
			summary: 'Flowchart requires at least one node',
			error: 'No nodes provided.',
		}
	}

	const nodeMap = new Map<string, FlowchartNodeInput>()
	const adj = new Map<string, string[]>()
	const inDegree = new Map<string, number>()

	for (const node of rawNodes) {
		if (!node.refId) continue
		nodeMap.set(node.refId, node)
		adj.set(node.refId, [])
		inDegree.set(node.refId, 0)
	}

	for (const edge of rawEdges) {
		if (nodeMap.has(edge.from) && nodeMap.has(edge.to) && edge.from !== edge.to) {
			adj.get(edge.from)?.push(edge.to)
			inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
		}
	}

	const layerOf = new Map<string, number>()
	const queue: string[] = []
	for (const [id, deg] of inDegree.entries()) {
		if (deg === 0) {
			layerOf.set(id, 0)
			queue.push(id)
		}
	}
	if (queue.length === 0 && rawNodes[0]?.refId) {
		layerOf.set(rawNodes[0].refId, 0)
		queue.push(rawNodes[0].refId)
	}

	const visitedCount = new Map<string, number>()
	while (queue.length > 0) {
		const curr = queue.shift()!
		const currLayer = layerOf.get(curr) ?? 0
		for (const next of adj.get(curr) ?? []) {
			const seen = (visitedCount.get(next) ?? 0) + 1
			if (seen > rawNodes.length) continue
			visitedCount.set(next, seen)
			const prevLayer = layerOf.get(next)
			if (prevLayer === undefined || currLayer + 1 > prevLayer) {
				layerOf.set(next, currLayer + 1)
				queue.push(next)
			}
		}
	}

	let maxLayer = 0
	for (const l of layerOf.values()) maxLayer = Math.max(maxLayer, l)
	for (const node of rawNodes) {
		if (!layerOf.has(node.refId)) {
			maxLayer += 1
			layerOf.set(node.refId, maxLayer)
		}
	}

	const layers: FlowchartNodeInput[][] = []
	for (const node of rawNodes) {
		const idx = layerOf.get(node.refId) ?? 0
		while (layers.length <= idx) layers.push([])
		layers[idx].push(node)
	}

	const dims = new Map<string, { w: number; h: number }>()
	for (const node of rawNodes) {
		dims.set(node.refId, computeNodeDimensions(node))
	}

	const gapMain = direction === 'vertical' ? 76 : 92
	const gapCross = direction === 'vertical' ? 56 : 52

	const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
	let cursorMain = 0
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const layer of layers) {
		if (layer.length === 0) continue

		if (direction === 'vertical') {
			const rowHeight = Math.max(...layer.map((n) => dims.get(n.refId)!.h))
			const totalRowWidth =
				layer.reduce((acc, n) => acc + dims.get(n.refId)!.w, 0) + gapCross * (layer.length - 1)
			let cursorCross = -totalRowWidth / 2

			for (const node of layer) {
				const { w, h } = dims.get(node.refId)!
				const x = Math.round(cursorCross)
				const y = Math.round(cursorMain + (rowHeight - h) / 2)
				positions.set(node.refId, { x, y, w, h })
				minX = Math.min(minX, x)
				minY = Math.min(minY, y)
				maxX = Math.max(maxX, x + w)
				maxY = Math.max(maxY, y + h)
				cursorCross += w + gapCross
			}
			cursorMain += rowHeight + gapMain
		} else {
			const colWidth = Math.max(...layer.map((n) => dims.get(n.refId)!.w))
			const totalColHeight =
				layer.reduce((acc, n) => acc + dims.get(n.refId)!.h, 0) + gapCross * (layer.length - 1)
			let cursorCross = -totalColHeight / 2

			for (const node of layer) {
				const { w, h } = dims.get(node.refId)!
				const x = Math.round(cursorMain + (colWidth - w) / 2)
				const y = Math.round(cursorCross)
				positions.set(node.refId, { x, y, w, h })
				minX = Math.min(minX, x)
				minY = Math.min(minY, y)
				maxX = Math.max(maxX, x + w)
				maxY = Math.max(maxY, y + h)
				cursorCross += h + gapCross
			}
			cursorMain += colWidth + gapMain
		}
	}

	const vpCenter = getSmartPlacementCenter(editor)
	const diagramW = maxX - minX
	const diagramH = maxY - minY
	let offsetX = Math.round(vpCenter.x - (minX + diagramW / 2))
	let offsetY = Math.round(vpCenter.y - (minY + diagramH / 2))

	const existingShapes = editor.getCurrentPageShapes()
	if (existingShapes.length > 0) {
		const candidateBox = new Box(minX + offsetX, minY + offsetY, diagramW, diagramH)
		const collidesExisting = existingShapes.some((s) => {
			const b = editor.getShapePageBounds(s.id)
			return b ? b.collides(candidateBox) : false
		})
		if (collidesExisting) {
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
				offsetX = Math.round(rightmost + 120 - minX)
				offsetY = Math.round(topMost - minY)
			}
		}
	}

	const createdIds: Record<string, string> = {}
	const createdNodeShapeIds: TLShapeId[] = []
	const allCreatedShapeIds: TLShapeId[] = []

	if (title) {
		const titleShapeId = createShapeId()
		editor.createShape<TLTextShape>({
			id: titleShapeId,
			type: 'text',
			x: Math.round(minX + offsetX),
			y: Math.round(minY + offsetY - 56),
			props: {
				color: 'black',
				size: 'l',
				autoSize: true,
				richText: toRichText(title),
			},
		})
		allCreatedShapeIds.push(titleShapeId)
	}

	for (const node of rawNodes) {
		const pos = positions.get(node.refId)
		if (!pos) continue
		const shapeId = createShapeId()
		const x = pos.x + offsetX
		const y = pos.y + offsetY

		if (node.shape === 'note') {
			editor.createShape<TLNoteShape>({
				id: shapeId,
				type: 'note',
				x,
				y,
				props: {
					color: asColor(node.color, 'yellow'),
					size: 'm',
					richText: toRichText(node.label),
				},
			})
		} else {
			const geo = asGeo(node.shape, 'rectangle')
			editor.createShape<TLGeoShape>({
				id: shapeId,
				type: 'geo',
				x,
				y,
				props: {
					geo,
					w: pos.w,
					h: pos.h,
					color: asColor(node.color, 'blue'),
					fill: asFill(node.fill, 'semi'),
					size: 'm',
					richText: toRichText(node.label),
				},
			})
		}

		refMap.set(node.refId, shapeId)
		createdIds[node.refId] = shapeId
		createdNodeShapeIds.push(shapeId)
		allCreatedShapeIds.push(shapeId)
	}

	let connectorCount = 0
	for (const edge of rawEdges) {
		const fromId = refMap.get(edge.from)
		const toId = refMap.get(edge.to)
		if (!fromId || !toId) continue
		const arrowId = createBoundConnector(editor, {
			fromShapeId: fromId,
			toShapeId: toId,
			label: edge.label,
			color: asColor(edge.color, 'black'),
			kind: arrowKind,
			dash: 'solid',
			arrowheadStart: 'none',
			arrowheadEnd: 'arrow',
		})
		allCreatedShapeIds.push(arrowId)
		connectorCount += 1
	}

	if (frameName) {
		const pad = 48
		const frameId = createShapeId()
		const frameY = title ? minY + offsetY - 80 : minY + offsetY - pad
		const frameH = diagramH + pad * 2 + (title ? 40 : 0)
		editor.createShape<TLFrameShape>({
			id: frameId,
			type: 'frame',
			x: Math.round(minX + offsetX - pad),
			y: Math.round(frameY),
			props: {
				w: Math.round(diagramW + pad * 2),
				h: Math.round(frameH),
				name: frameName,
				color: 'grey',
			},
		})
		editor.reparentShapes(allCreatedShapeIds, frameId)
		allCreatedShapeIds.push(frameId)
		createdIds.frame = frameId
	}

	const combinedBounds = new Box(
		minX + offsetX - 40,
		minY + offsetY - (title ? 80 : 40),
		diagramW + 80,
		diagramH + (title ? 120 : 80)
	)
	editor.zoomToBounds(combinedBounds, {
		animation: { duration: 350 },
		inset: 72,
	})

	const heading = title || frameName ? ` "${title || frameName}"` : ''
	return {
		ok: true,
		summary: `Created flowchart${heading} (${createdNodeShapeIds.length} shapes, ${connectorCount} connectors)`,
		createdIds,
		affectedIds: allCreatedShapeIds,
	}
}

function handleCreateFlowchart(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	const result = buildFlowchartOnCanvas(
		editor,
		{
			title: asString(args.title),
			frameName: asString(args.frameName),
			direction: args.direction === 'horizontal' ? 'horizontal' : 'vertical',
			arrowKind: asArrowKind(args.arrowKind, 'arc'),
			nodes: Array.isArray(args.nodes) ? (args.nodes as FlowchartNodeInput[]) : [],
			edges: Array.isArray(args.edges) ? (args.edges as FlowchartEdgeInput[]) : [],
		},
		refMap
	)
	return {
		id: call.id,
		name: call.name,
		...result,
	}
}

async function handleCreateMermaid(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): Promise<AgentToolResult> {
	const code = asString(call.args.code)?.trim()
	const mode = asString(call.args.mode) ?? 'auto'
	const title = asString(call.args.title)?.trim()

	if (!code) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'Mermaid code was empty',
			error: 'Provide valid Mermaid syntax in `code`.',
		}
	}

	if (mode === 'editable' || mode === 'auto') {
		const parsed = parseMermaidFlowchart(code)
		if (parsed) {
			let res: ReturnType<typeof buildFlowchartOnCanvas> | null = null
			editor.markHistoryStoppingPoint('create-mermaid-editable')
			editor.run(() => {
				res = buildFlowchartOnCanvas(
					editor,
					{
						title,
						direction: parsed.direction,
						nodes: parsed.nodes,
						edges: parsed.edges,
					},
					refMap
				)
			})
			if (res) {
				const built = res as ReturnType<typeof buildFlowchartOnCanvas>
				return {
					id: call.id,
					name: call.name,
					...built,
					summary: `Imported Mermaid as editable shapes (${parsed.nodes.length} nodes, ${parsed.edges.length} edges)`,
				}
			}
		} else if (mode === 'editable') {
			// Fall back to crisp SVG rendering for non-flowchart Mermaid diagrams
		}
	}

	const inserted = await insertMermaidAsSvgShape(editor, code, title)
	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Rendered Mermaid diagram${title ? ` "${title}"` : ''} as SVG (${inserted.width}×${inserted.height})`,
		createdIds: { mermaid: inserted.shapeId },
		affectedIds: [inserted.shapeId],
	}
}

function handleCreateKanban(editor: Editor, call: AgentToolCall): AgentToolResult {
	const title = asString(call.args.title)
	const rawCols = Array.isArray(call.args.columns) ? (call.args.columns as KanbanColumnInput[]) : []
	const built = createKanbanBoard(editor, { title, columns: rawCols })
	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: built.summary,
		affectedIds: [...built.frameIds, ...built.cardIds],
	}
}

function handleAddKanbanCard(editor: Editor, call: AgentToolCall): AgentToolResult {
	const column = asString(call.args.column) ?? ''
	const text = asString(call.args.text) ?? ''
	const color = asColor(call.args.color, 'yellow')
	const res = addKanbanCard(editor, column, text, color)
	return {
		id: call.id,
		name: call.name,
		ok: res.ok,
		summary: res.summary,
		...(res.cardId ? { affectedIds: [res.cardId] } : {}),
		...(res.error ? { error: res.error } : {}),
	}
}

function handleCreateDocument(editor: Editor, call: AgentToolCall): AgentToolResult {
	const title = asString(call.args.title)?.trim() || 'Untitled Document'
	const markdown = asString(call.args.markdown) ?? ''
	const html = markdownToHtml(markdown)
	const id = insertDocumentOnCanvas(editor, {
		title,
		html,
		sourceFormat: 'DOC',
		w: asNumber(call.args.w),
		h: asNumber(call.args.h),
	})
	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Created editable document "${title}"`,
		createdIds: { document: id },
		affectedIds: [id],
	}
}

function handleUpdateDocument(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const explicitId = resolveShapeId(editor, call.args.shapeId, refMap)
	let targetShape = explicitId ? editor.getShape(explicitId) : undefined

	if (!targetShape) {
		const selectedDoc = editor
			.getSelectedShapes()
			.find((s) => s.type === 'document')
		targetShape =
			selectedDoc ??
			editor.getCurrentPageShapes().find((s) => s.type === 'document')
	}

	if (!targetShape || targetShape.type !== 'document') {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'No document shape found to update',
			error: 'Select or upload a document shape first.',
		}
	}

	const title = asString(call.args.title)?.trim()
	const markdown = asString(call.args.markdown)
	const doc = targetShape as DocumentShape

	editor.updateShape<DocumentShape>({
		id: doc.id,
		type: 'document',
		props: {
			...(title ? { title } : {}),
			...(markdown !== undefined ? { html: sanitizeDocumentHtml(markdownToHtml(markdown)) } : {}),
		},
	})

	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Updated document "${title || doc.props.title}"`,
		affectedIds: [doc.id],
	}
}

function handleCreateEmbed(editor: Editor, call: AgentToolCall): AgentToolResult {
	const url = asString(call.args.url)?.trim()
	if (!url) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'Missing URL for embed',
			error: 'Provide a valid URL.',
		}
	}
	const w = Math.max(240, asNumber(call.args.w) ?? 560)
	const h = Math.max(180, asNumber(call.args.h) ?? 360)
	const center = getSmartPlacementCenter(editor)
	const id = createShapeId()

	editor.createShape<TLEmbedShape>({
		id,
		type: 'embed',
		x: Math.round(center.x - w / 2),
		y: Math.round(center.y - h / 2),
		props: { w, h, url },
	})

	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Embedded ${url}`,
		affectedIds: [id],
	}
}

function handleUpdateShape(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	const targetIds = resolveTargetShapeIds(editor, args, refMap)
	if (targetIds.length === 0) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'No matching shapes to update',
			error: 'No valid shapeIds provided and no shapes are currently selected.',
		}
	}

	const updatedIds: TLShapeId[] = []
	for (const id of targetIds) {
		const shape = editor.getShape(id)
		if (!shape) continue

		const x = asNumber(args.x)
		const y = asNumber(args.y)
		const w = asNumber(args.w)
		const h = asNumber(args.h)
		const text = asString(args.text)
		const color = typeof args.color === 'string' ? asColor(args.color) : undefined
		const fill = typeof args.fill === 'string' ? asFill(args.fill) : undefined
		const geo = typeof args.geo === 'string' ? asGeo(args.geo) : undefined
		const size = typeof args.size === 'string' ? asSize(args.size) : undefined

		const propsUpdate: Record<string, unknown> = {}
		if (color) propsUpdate.color = color
		if (size && shape.type !== 'frame') propsUpdate.size = size

		if (shape.type === 'geo') {
			if (fill) propsUpdate.fill = fill
			if (geo) propsUpdate.geo = geo
			if (w !== undefined) propsUpdate.w = Math.max(24, w)
			if (h !== undefined) propsUpdate.h = Math.max(24, h)
			if (text !== undefined) propsUpdate.richText = toRichText(text)
		} else if (shape.type === 'text') {
			if (w !== undefined) {
				propsUpdate.w = Math.max(24, w)
				propsUpdate.autoSize = false
			}
			if (text !== undefined) propsUpdate.richText = toRichText(text)
		} else if (shape.type === 'note') {
			if (text !== undefined) propsUpdate.richText = toRichText(text)
		} else if (shape.type === 'arrow') {
			if (fill) propsUpdate.fill = fill
			if (text !== undefined) propsUpdate.richText = toRichText(text)
		} else if (shape.type === 'frame') {
			if (w !== undefined) propsUpdate.w = Math.max(80, w)
			if (h !== undefined) propsUpdate.h = Math.max(80, h)
			if (text !== undefined) propsUpdate.name = text
		}

		editor.updateShape({
			id: shape.id,
			type: shape.type,
			...(x !== undefined ? { x } : {}),
			...(y !== undefined ? { y } : {}),
			...(Object.keys(propsUpdate).length > 0 ? { props: propsUpdate } : {}),
		} as Parameters<Editor['updateShape']>[0])

		updatedIds.push(shape.id)
	}

	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Updated ${updatedIds.length} shape${updatedIds.length === 1 ? '' : 's'}`,
		affectedIds: updatedIds,
	}
}

function handleMoveShapes(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	const targetIds = resolveTargetShapeIds(editor, args, refMap)
	const dx = asNumber(args.dx) ?? 0
	const dy = asNumber(args.dy) ?? 0

	if (targetIds.length === 0) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'No matching shapes to move',
			error: 'No valid shapeIds provided and no shapes are currently selected.',
		}
	}

	const updates = targetIds
		.map((id) => editor.getShape(id))
		.filter((s): s is NonNullable<typeof s> => Boolean(s))
		.map((s) => ({
			id: s.id,
			type: s.type,
			x: s.x + dx,
			y: s.y + dy,
		}))

	editor.updateShapes(updates as Parameters<Editor['updateShapes']>[0])

	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Moved ${updates.length} shape${updates.length === 1 ? '' : 's'} by (${dx}, ${dy})`,
		affectedIds: updates.map((u) => u.id),
	}
}

function handleDeleteShapes(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const targetIds = resolveTargetShapeIds(editor, call.args, refMap)
	if (targetIds.length === 0) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'No matching shapes to delete',
			error: 'No valid shapeIds provided and no shapes are currently selected.',
		}
	}

	editor.deleteShapes(targetIds)
	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Deleted ${targetIds.length} shape${targetIds.length === 1 ? '' : 's'}`,
		affectedIds: targetIds,
	}
}

function handleArrangeShapes(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	const operation = asString(args.operation) ?? 'row'
	const gap = Math.max(8, asNumber(args.gap) ?? 32)
	const targetIds = resolveTargetShapeIds(editor, args, refMap)

	if (targetIds.length < 2) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'Select or specify at least 2 shapes to arrange',
			error: 'At least 2 shapes are needed for arrange_shapes.',
		}
	}

	const alignMap: Record<
		string,
		'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom'
	> = {
		'align-left': 'left',
		'align-center-horizontal': 'center-horizontal',
		'align-right': 'right',
		'align-top': 'top',
		'align-center-vertical': 'center-vertical',
		'align-bottom': 'bottom',
	}

	if (operation in alignMap) {
		editor.alignShapes(targetIds, alignMap[operation])
	} else if (operation === 'distribute-horizontal') {
		editor.distributeShapes(targetIds, 'horizontal')
	} else if (operation === 'distribute-vertical') {
		editor.distributeShapes(targetIds, 'vertical')
	} else {
		const entries = targetIds
			.map((id) => ({
				id,
				shape: editor.getShape(id),
				bounds: editor.getShapePageBounds(id),
			}))
			.filter(
				(e): e is { id: TLShapeId; shape: NonNullable<ReturnType<Editor['getShape']>>; bounds: Box } =>
					Boolean(e.shape && e.bounds)
			)

		if (entries.length === 0) {
			return {
				id: call.id,
				name: call.name,
				ok: false,
				summary: 'No valid shapes to arrange',
				error: 'Could not compute bounds for target shapes.',
			}
		}

		const startX = Math.min(...entries.map((e) => e.bounds.x))
		const startY = Math.min(...entries.map((e) => e.bounds.y))
		const cols =
			operation === 'row'
				? entries.length
				: operation === 'column'
					? 1
					: Math.ceil(Math.sqrt(entries.length))

		const cellW = Math.max(...entries.map((e) => e.bounds.w))
		const cellH = Math.max(...entries.map((e) => e.bounds.h))

		const updates = entries.map((entry, idx) => {
			const col = idx % cols
			const row = Math.floor(idx / cols)
			const targetX = startX + col * (cellW + gap)
			const targetY = startY + row * (cellH + gap)
			return {
				id: entry.id,
				type: entry.shape.type,
				x: entry.shape.x + (targetX - entry.bounds.x),
				y: entry.shape.y + (targetY - entry.bounds.y),
			}
		})

		editor.updateShapes(updates as Parameters<Editor['updateShapes']>[0])
	}

	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Arranged ${targetIds.length} shapes (${operation})`,
		affectedIds: targetIds,
	}
}

function handleManageShapes(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const action = asString(call.args.action)
	const targetIds = resolveTargetShapeIds(editor, call.args, refMap)

	if (targetIds.length === 0) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'No shapes selected or specified',
			error: 'Select shapes or pass shapeIds.',
		}
	}

	switch (action) {
		case 'group':
			editor.groupShapes(targetIds)
			return { id: call.id, name: call.name, ok: true, summary: `Grouped ${targetIds.length} shapes`, affectedIds: targetIds }
		case 'ungroup':
			editor.ungroupShapes(targetIds)
			return { id: call.id, name: call.name, ok: true, summary: 'Ungrouped shapes', affectedIds: targetIds }
		case 'toggle-lock':
			editor.toggleLock(targetIds)
			return { id: call.id, name: call.name, ok: true, summary: `Toggled lock on ${targetIds.length} shape(s)`, affectedIds: targetIds }
		case 'duplicate':
			editor.duplicateShapes(targetIds, { x: 24, y: 24 })
			return { id: call.id, name: call.name, ok: true, summary: `Duplicated ${targetIds.length} shape(s)`, affectedIds: targetIds }
		case 'bring-to-front':
			editor.bringToFront(targetIds)
			return { id: call.id, name: call.name, ok: true, summary: `Brought ${targetIds.length} shape(s) to front`, affectedIds: targetIds }
		case 'send-to-back':
			editor.sendToBack(targetIds)
			return { id: call.id, name: call.name, ok: true, summary: `Sent ${targetIds.length} shape(s) to back`, affectedIds: targetIds }
		default:
			return { id: call.id, name: call.name, ok: false, summary: `Unknown manage_shapes action: ${String(action)}` }
	}
}

function handleManagePage(editor: Editor, call: AgentToolCall): AgentToolResult {
	const action = asString(call.args.action)
	const name = asString(call.args.name)?.trim()
	const pageId = asString(call.args.pageId)?.trim()

	if (action === 'create') {
		const newName = name || `Page ${editor.getPages().length + 1}`
		editor.createPage({ name: newName })
		const pages = editor.getPages()
		const created = pages[pages.length - 1]
		if (created) editor.setCurrentPage(created.id)
		return { id: call.id, name: call.name, ok: true, summary: `Created and switched to page "${newName}"` }
	}

	if (action === 'switch') {
		const pages = editor.getPages()
		const target =
			(pageId ? pages.find((p) => p.id === (pageId as TLPageId)) : undefined) ??
			(name ? pages.find((p) => p.name.toLowerCase() === name.toLowerCase()) : undefined)
		if (!target) {
			return { id: call.id, name: call.name, ok: false, summary: 'Target page not found', error: 'No matching page.' }
		}
		editor.setCurrentPage(target.id)
		return { id: call.id, name: call.name, ok: true, summary: `Switched to page "${target.name}"` }
	}

	if (action === 'rename' && name) {
		editor.renamePage(editor.getCurrentPageId(), name)
		return { id: call.id, name: call.name, ok: true, summary: `Renamed current page to "${name}"` }
	}

	return { id: call.id, name: call.name, ok: false, summary: 'Invalid manage_page arguments' }
}

function handleSelectAndFocus(
	editor: Editor,
	call: AgentToolCall,
	refMap: Map<string, TLShapeId>
): AgentToolResult {
	const args = call.args
	if (args.fitAll === true) {
		editor.zoomToFit({ animation: { duration: 350 } })
		return {
			id: call.id,
			name: call.name,
			ok: true,
			summary: 'Zoomed canvas to fit all shapes',
		}
	}

	const targetIds = resolveTargetShapeIds(editor, args, refMap)
	if (targetIds.length === 0) {
		return {
			id: call.id,
			name: call.name,
			ok: false,
			summary: 'No matching shapes to focus',
			error: 'No valid shapeIds provided.',
		}
	}

	editor.select(...targetIds)
	editor.zoomToSelection({ animation: { duration: 350 } })
	return {
		id: call.id,
		name: call.name,
		ok: true,
		summary: `Selected and focused ${targetIds.length} shape${targetIds.length === 1 ? '' : 's'}`,
		affectedIds: targetIds,
	}
}

export async function executeCanvasActions(
	editor: Editor,
	calls: AgentToolCall[],
	sharedRefMap?: Map<string, TLShapeId>
): Promise<AgentToolResult[]> {
	const refMap = sharedRefMap ?? new Map<string, TLShapeId>()
	const results: AgentToolResult[] = []

	for (const call of calls) {
		try {
			if (call.name === 'create_mermaid_diagram') {
				results.push(await handleCreateMermaid(editor, call, refMap))
				continue
			}

			if (call.name === 'create_kanban_board') {
				results.push(handleCreateKanban(editor, call))
				continue
			}

			if (call.name === 'add_kanban_card') {
				results.push(handleAddKanbanCard(editor, call))
				continue
			}

			if (call.name === 'create_document') {
				results.push(handleCreateDocument(editor, call))
				continue
			}

			editor.markHistoryStoppingPoint('gemini-agent')
			editor.run(() => {
				switch (call.name) {
					case 'update_document':
						results.push(handleUpdateDocument(editor, call, refMap))
						break
					case 'create_shape':
						results.push(handleCreateShape(editor, call, refMap))
						break
					case 'create_connector':
						results.push(handleCreateConnector(editor, call, refMap))
						break
					case 'create_flowchart':
						results.push(handleCreateFlowchart(editor, call, refMap))
						break
					case 'create_embed':
						results.push(handleCreateEmbed(editor, call))
						break
					case 'update_shape':
						results.push(handleUpdateShape(editor, call, refMap))
						break
					case 'move_shapes':
						results.push(handleMoveShapes(editor, call, refMap))
						break
					case 'delete_shapes':
						results.push(handleDeleteShapes(editor, call, refMap))
						break
					case 'arrange_shapes':
						results.push(handleArrangeShapes(editor, call, refMap))
						break
					case 'manage_shapes':
						results.push(handleManageShapes(editor, call, refMap))
						break
					case 'manage_page':
						results.push(handleManagePage(editor, call))
						break
					case 'select_and_focus':
						results.push(handleSelectAndFocus(editor, call, refMap))
						break
					default:
						results.push({
							id: call.id,
							name: call.name,
							ok: false,
							summary: `Unknown action: ${String(call.name)}`,
							error: `Unsupported tool "${String(call.name)}".`,
						})
				}
			})
		} catch (err) {
			results.push({
				id: call.id,
				name: call.name,
				ok: false,
				summary: `Failed ${call.name}`,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	return results
}
