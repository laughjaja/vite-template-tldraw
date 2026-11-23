import mermaid from 'mermaid'
import {
	AssetRecordType,
	Box,
	createShapeId,
	type Editor,
	type TLImageAsset,
	type TLImageShape,
	type TLShapeId,
} from 'tldraw'

let mermaidInitialized = false

function ensureMermaidInit() {
	if (mermaidInitialized) return
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: 'default',
		fontFamily: 'Inter, system-ui, sans-serif',
	})
	mermaidInitialized = true
}

export interface ParsedMermaidNode {
	refId: string
	label: string
	shape: 'rectangle' | 'oval' | 'ellipse' | 'diamond' | 'hexagon' | 'cloud'
	color: string
	fill: string
}

export interface ParsedMermaidEdge {
	from: string
	to: string
	label?: string
}

export interface ParsedMermaidFlowchart {
	direction: 'vertical' | 'horizontal'
	nodes: ParsedMermaidNode[]
	edges: ParsedMermaidEdge[]
}

export const MERMAID_PRESETS: Array<{ name: string; code: string }> = [
	{
		name: 'Flowchart',
		code: `flowchart TD
    A([Start Request]) --> B[Authenticate User]
    B --> C{Valid Token?}
    C -->|Yes| D[Load Dashboard]
    C -->|No| E[Return 401 Error]
    D --> F([Done])
    E --> F`,
	},
	{
		name: 'Sequence Diagram',
		code: `sequenceDiagram
    participant U as User
    participant A as App UI
    participant G as Gemini API
    U->>A: Enter canvas prompt
    A->>G: Stream context + tools
    G-->>A: Tool calls & text chunks
    A->>U: Update tldraw canvas live`,
	},
	{
		name: 'ER Diagram',
		code: `erDiagram
    WORKSPACE ||--o{ PAGE : contains
    PAGE ||--o{ SHAPE : holds
    SHAPE ||--o{ COMMENT : annotates
    USER ||--o{ COMMENT : writes`,
	},
	{
		name: 'State Diagram',
		code: `stateDiagram-v2
    [*] --> Idle
    Idle --> Streaming: Send prompt
    Streaming --> ModifyingCanvas: Tool call
    ModifyingCanvas --> Streaming: Tool results
    Streaming --> Idle: Complete
    Streaming --> Idle: Stop`,
	},
	{
		name: 'Mindmap',
		code: `mindmap
  root((Product Launch))
    Design
      Wireframes
      Design System
    Engineering
      Frontend
      API & AI
    Marketing
      Landing Page
      Demo Video`,
	},
]

function parseNodeToken(raw: string): {
	id: string
	label?: string
	shape?: ParsedMermaidNode['shape']
} | null {
	const token = raw.trim()
	if (!token) return null

	// Match common Mermaid flowchart node syntaxes:
	// id([label]), id((label)), id{{label}}, id{label}, id[label], id(label), or bare id
	const patterns: Array<{ regex: RegExp; shape: ParsedMermaidNode['shape'] }> = [
		{ regex: /^([A-Za-z0-9_.-]+)\s*\(\[([^\]]+)\]\)$/, shape: 'oval' },
		{ regex: /^([A-Za-z0-9_.-]+)\s*\(\(([^)]+)\)\)$/, shape: 'ellipse' },
		{ regex: /^([A-Za-z0-9_.-]+)\s*\{\{([^}]+)\}\}$/, shape: 'hexagon' },
		{ regex: /^([A-Za-z0-9_.-]+)\s*\{([^}]+)\}$/, shape: 'diamond' },
		{ regex: /^([A-Za-z0-9_.-]+)\s*\["?([^"\]]+)"?\]$/, shape: 'rectangle' },
		{ regex: /^([A-Za-z0-9_.-]+)\s*\("?([^")]+)"?\)$/, shape: 'oval' },
	]

	for (const { regex, shape } of patterns) {
		const m = token.match(regex)
		if (m) {
			return {
				id: m[1].trim(),
				label: m[2].replace(/^["']|["']$/g, '').trim(),
				shape,
			}
		}
	}

	const bare = token.match(/^([A-Za-z0-9_.-]+)$/)
	if (bare) {
		return { id: bare[1].trim() }
	}

	return null
}

function defaultColorForShape(shape: ParsedMermaidNode['shape']): string {
	switch (shape) {
		case 'diamond':
			return 'orange'
		case 'oval':
		case 'ellipse':
			return 'green'
		case 'hexagon':
			return 'violet'
		default:
			return 'blue'
	}
}

/**
 * Parses Mermaid flowchart/graph code into structured nodes & edges so it can be
 * inserted as 100% native editable tldraw shapes + bound connectors.
 * Returns null for non-flowchart diagram types (sequence, ER, gantt, etc.).
 */
export function parseMermaidFlowchart(code: string): ParsedMermaidFlowchart | null {
	const lines = code
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith('%%'))

	if (lines.length === 0) return null

	const headerMatch = lines[0].match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/i)
	if (!headerMatch) return null

	const dirToken = headerMatch[1].toUpperCase()
	const direction: 'vertical' | 'horizontal' =
		dirToken === 'LR' || dirToken === 'RL' ? 'horizontal' : 'vertical'

	const nodeMap = new Map<string, ParsedMermaidNode>()
	const edges: ParsedMermaidEdge[] = []

	const upsertNode = (token: string): string | null => {
		const parsed = parseNodeToken(token)
		if (!parsed) return null
		const existing = nodeMap.get(parsed.id)
		if (!existing) {
			const shape = parsed.shape ?? 'rectangle'
			nodeMap.set(parsed.id, {
				refId: parsed.id,
				label: parsed.label ?? parsed.id,
				shape,
				color: defaultColorForShape(shape),
				fill: 'semi',
			})
		} else {
			if (parsed.label) existing.label = parsed.label
			if (parsed.shape) {
				existing.shape = parsed.shape
				existing.color = defaultColorForShape(parsed.shape)
			}
		}
		return parsed.id
	}

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].replace(/;$/, '').trim()
		if (
			!line ||
			/^subgraph\b/i.test(line) ||
			/^end$/i.test(line) ||
			/^classDef\b/i.test(line) ||
			/^class\b/i.test(line) ||
			/^style\b/i.test(line) ||
			/^linkStyle\b/i.test(line)
		) {
			continue
		}

		// Edge formats:
		// A -->|label| B
		// A -- label --> B
		// A --> B, A -.-> B, A ==> B, A --- B
		const pipeEdge = line.match(
			/^(.+?)\s*(?:-->|-.->|==>|---)\s*\|([^|]+)\|\s*(.+)$/
		)
		if (pipeEdge) {
			const fromId = upsertNode(pipeEdge[1])
			const toId = upsertNode(pipeEdge[3])
			if (fromId && toId) {
				edges.push({ from: fromId, to: toId, label: pipeEdge[2].trim() })
			}
			continue
		}

		const inlineLabelEdge = line.match(
			/^(.+?)\s*(?:--|==|-\.)\s+(.+?)\s*(?:-->|==>|-\.->)\s*(.+)$/
		)
		if (inlineLabelEdge) {
			const fromId = upsertNode(inlineLabelEdge[1])
			const toId = upsertNode(inlineLabelEdge[3])
			if (fromId && toId) {
				edges.push({ from: fromId, to: toId, label: inlineLabelEdge[2].trim() })
			}
			continue
		}

		const simpleEdge = line.match(/^(.+?)\s*(?:-->|-.->|==>|---)\s*(.+)$/)
		if (simpleEdge) {
			const fromId = upsertNode(simpleEdge[1])
			const toId = upsertNode(simpleEdge[2])
			if (fromId && toId) {
				edges.push({ from: fromId, to: toId })
			}
			continue
		}

		// Standalone node definition
		upsertNode(line)
	}

	if (nodeMap.size === 0) return null

	return {
		direction,
		nodes: Array.from(nodeMap.values()),
		edges,
	}
}

export async function renderMermaidSvg(code: string): Promise<{
	svg: string
	width: number
	height: number
}> {
	ensureMermaidInit()
	const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
	const { svg } = await mermaid.render(id, code.trim())

	let width = 640
	let height = 420
	const viewBoxMatch = svg.match(/viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/)
	if (viewBoxMatch) {
		width = Math.max(180, Math.round(Number(viewBoxMatch[1])))
		height = Math.max(120, Math.round(Number(viewBoxMatch[2])))
	}

	// Ensure explicit width/height attributes on SVG root for crisp <img> rendering
	let normalizedSvg = svg
	if (!/xmlns=/.test(normalizedSvg)) {
		normalizedSvg = normalizedSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
	}

	return { svg: normalizedSvg, width, height }
}

function utf8ToBase64(str: string): string {
	const bytes = new TextEncoder().encode(str)
	let binary = ''
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

export async function insertMermaidAsSvgShape(
	editor: Editor,
	code: string,
	title?: string
): Promise<{ shapeId: TLShapeId; width: number; height: number }> {
	const { svg, width, height } = await renderMermaidSvg(code)

	// Scale nicely into a readable canvas dimension (max 760px wide)
	const scale = width > 760 ? 760 / width : 1
	const targetW = Math.max(220, Math.round(width * scale))
	const targetH = Math.max(140, Math.round(height * scale))

	const dataUrl = `data:image/svg+xml;base64,${utf8ToBase64(svg)}`
	const assetId = AssetRecordType.createId()
	const shapeId = createShapeId()

	const vp = editor.getViewportPageBounds()
	const x = Math.round(vp.x + vp.w / 2 - targetW / 2)
	const y = Math.round(vp.y + vp.h / 2 - targetH / 2)

	const asset: TLImageAsset = {
		id: assetId,
		typeName: 'asset',
		type: 'image',
		props: {
			w: targetW,
			h: targetH,
			name: `${title || 'mermaid-diagram'}.svg`,
			isAnimated: false,
			mimeType: 'image/svg+xml',
			src: dataUrl,
		},
		meta: {},
	}

	editor.markHistoryStoppingPoint('insert-mermaid-svg')
	editor.run(() => {
		editor.createAssets([asset])
		editor.createShape<TLImageShape>({
			id: shapeId,
			type: 'image',
			x,
			y,
			props: {
				w: targetW,
				h: targetH,
				assetId,
				altText: title || 'Mermaid Diagram',
			},
		})
		editor.select(shapeId)
	})

	editor.zoomToBounds(new Box(x - 40, y - 40, targetW + 80, targetH + 80), {
		animation: { duration: 320 },
		inset: 72,
	})

	return { shapeId, width: targetW, height: targetH }
}
