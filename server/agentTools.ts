import { Type, type FunctionDeclaration } from '@google/genai'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash'

export const SUPPORTED_GEMINI_MODELS = [
	'gemini-3.6-flash',
	'gemini-3.5-flash',
	'gemini-3.5-flash-lite',
	'gemini-3.8-flash',
] as const

const COLOR_VALUES = [
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
]

const FILL_VALUES = ['none', 'semi', 'solid', 'pattern', 'fill']
const SIZE_VALUES = ['s', 'm', 'l', 'xl']
const GEO_VALUES = [
	'rectangle',
	'ellipse',
	'diamond',
	'oval',
	'triangle',
	'hexagon',
	'pentagon',
	'octagon',
	'star',
	'cloud',
	'trapezoid',
	'rhombus',
	'check-box',
	'x-box',
	'heart',
	'arrow-right',
	'arrow-left',
	'arrow-up',
	'arrow-down',
]

export const AGENT_SYSTEM_INSTRUCTION = `You are a Gemini AI canvas assistant embedded directly inside a tldraw infinite whiteboard application.

You can see the user's real tldraw canvas (every shape's ID, type, position, size, text/label, color, connectors/bindings, parent frames, lock state, which shapes the user currently selected, all pages, editor mode, the current viewport bounds, and optionally a visual screenshot of the canvas) and you can directly modify the canvas using your tools.

## Core Principles
1. **Be genuinely canvas-aware**:
   - When the user asks about what is on the canvas or what they selected, inspect \`canvasContext.shapes\` and \`canvasContext.selectedShapeIds\` carefully and answer accurately using the actual text and structure on the board.
   - Never hallucinate shape IDs. Only pass real IDs from \`canvasContext.shapes\` / \`canvasContext.selectedShapeIds\`, or \`refId\` aliases you defined earlier in the same turn.
2. **Choose the right tool for the job**:
   - **Flowcharts & architecture diagrams**: use \`create_flowchart\` for editable multi-step flows with automatic collision-free layout and bound arrows.
   - **Mermaid diagrams**: when the user asks for Mermaid (flowchart, sequenceDiagram, erDiagram, classDiagram, stateDiagram-v2, gantt, mindmap) or pastes Mermaid syntax, use \`create_mermaid_diagram\`. Flowcharts can be inserted as editable shapes or SVG; sequence/ER/class/state/mindmap/gantt diagrams render cleanly as SVG!
   - **Kanban boards**: when the user asks for a Kanban board, sprint board, task tracker, or roadmap columns, use \`create_kanban_board\` (or \`add_kanban_card\` to add cards to an existing column frame).
   - **In-canvas Documents**: users can upload Word (.docx), Markdown, HTML, or text documents as editable \`document\` shapes on the canvas. You can read their full text from \`canvasContext.shapes\` (type \`"document"\`), summarize/diagram them, or create/update documents using \`create_document\` and \`update_document\`.
   - **Individual shapes & labels**: use \`create_shape\` for geo shapes, sticky notes, text, or frames.
   - **Connectors**: use \`create_connector\` with \`fromId\` and \`toId\` so connectors stay bound when shapes move.
   - **Embeds**: use \`create_embed\` for supported embed URLs (YouTube, Figma, CodePen, CodeSandbox, Google Maps, etc.).
   - **Editing & organizing**: use \`update_shape\`, \`move_shapes\`, \`arrange_shapes\`, \`manage_shapes\` (group/ungroup/lock/unlock/duplicate/z-order), \`delete_shapes\`, \`manage_page\` (create/switch/rename pages), and \`select_and_focus\`.
3. **Layout & Placement**:
   - Canvas coordinates are tldraw page coordinates (x increases right, y increases down).
   - Place new standalone shapes near \`canvasContext.viewport.centerX, canvasContext.viewport.centerY\`, avoiding overlap when possible.
   - Pick cohesive, readable colors and \`semi\` fill.
4. **Communication Style**:
   - Keep responses concise, helpful, and grounded in what was actually read or changed on the canvas.
   - If the user asks a pure question without requesting canvas edits, answer directly without calling mutation tools.`

export const AGENT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
	{
		name: 'create_shape',
		description:
			'Create an editable tldraw shape on the canvas: a geo shape (rectangle, ellipse, diamond, cloud, etc.), a sticky note, a standalone text label, or a frame.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				refId: {
					type: Type.STRING,
					description:
						'Optional short local alias (e.g., "box1", "start") so create_connector calls in the same turn can connect to this shape.',
				},
				kind: {
					type: Type.STRING,
					enum: ['geo', 'text', 'note', 'frame'],
					description: 'Type of tldraw shape to create. Default is "geo".',
				},
				geo: {
					type: Type.STRING,
					enum: GEO_VALUES,
					description: 'Geometric shape variant when kind is "geo". Default is "rectangle".',
				},
				text: {
					type: Type.STRING,
					description: 'Editable text label inside the shape (or frame title when kind is "frame").',
				},
				x: {
					type: Type.NUMBER,
					description: 'Page X coordinate for top-left of shape. Omit to auto-place near viewport center.',
				},
				y: {
					type: Type.NUMBER,
					description: 'Page Y coordinate for top-left of shape. Omit to auto-place near viewport center.',
				},
				w: { type: Type.NUMBER, description: 'Width in pixels.' },
				h: { type: Type.NUMBER, description: 'Height in pixels.' },
				color: { type: Type.STRING, enum: COLOR_VALUES },
				fill: { type: Type.STRING, enum: FILL_VALUES },
				size: { type: Type.STRING, enum: SIZE_VALUES },
			},
			required: ['kind'],
		},
	},
	{
		name: 'create_connector',
		description:
			'Create an editable tldraw arrow connector between two shapes (bound so moving shapes keeps the arrow attached) or between two page coordinates.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				fromId: { type: Type.STRING, description: 'Existing shape ID or refId for arrow start.' },
				toId: { type: Type.STRING, description: 'Existing shape ID or refId for arrow end.' },
				startX: { type: Type.NUMBER },
				startY: { type: Type.NUMBER },
				endX: { type: Type.NUMBER },
				endY: { type: Type.NUMBER },
				label: { type: Type.STRING, description: 'Optional editable text label on the arrow.' },
				color: { type: Type.STRING, enum: COLOR_VALUES },
				kind: { type: Type.STRING, enum: ['arc', 'elbow'] },
				dash: { type: Type.STRING, enum: ['draw', 'solid', 'dashed', 'dotted'] },
				arrowheadStart: {
					type: Type.STRING,
					enum: ['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar'],
				},
				arrowheadEnd: {
					type: Type.STRING,
					enum: ['none', 'arrow', 'triangle', 'dot', 'diamond', 'bar'],
				},
			},
		},
	},
	{
		name: 'create_flowchart',
		description:
			'Create a complete, cleanly laid-out flowchart, process diagram, mindmap, or architecture diagram with editable shapes, bound labeled connectors, optional title/frame, and automatic layout.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				title: { type: Type.STRING },
				frameName: { type: Type.STRING },
				direction: { type: Type.STRING, enum: ['vertical', 'horizontal'] },
				arrowKind: { type: Type.STRING, enum: ['arc', 'elbow'] },
				nodes: {
					type: Type.ARRAY,
					items: {
						type: Type.OBJECT,
						properties: {
							refId: { type: Type.STRING },
							label: { type: Type.STRING },
							shape: {
								type: Type.STRING,
								enum: ['rectangle', 'oval', 'ellipse', 'diamond', 'cloud', 'hexagon', 'note'],
							},
							color: { type: Type.STRING, enum: COLOR_VALUES },
							fill: { type: Type.STRING, enum: FILL_VALUES },
						},
						required: ['refId', 'label'],
					},
				},
				edges: {
					type: Type.ARRAY,
					items: {
						type: Type.OBJECT,
						properties: {
							from: { type: Type.STRING },
							to: { type: Type.STRING },
							label: { type: Type.STRING },
							color: { type: Type.STRING, enum: COLOR_VALUES },
						},
						required: ['from', 'to'],
					},
				},
			},
			required: ['nodes'],
		},
	},
	{
		name: 'create_mermaid_diagram',
		description:
			'Render or import a Mermaid diagram onto the canvas. Supports flowchart/graph (convertible into native editable tldraw shapes) as well as sequenceDiagram, erDiagram, classDiagram, stateDiagram-v2, mindmap, and gantt (rendered as crisp SVG).',
		parameters: {
			type: Type.OBJECT,
			properties: {
				code: {
					type: Type.STRING,
					description: 'Valid Mermaid diagram source code.',
				},
				mode: {
					type: Type.STRING,
					enum: ['auto', 'editable', 'svg'],
					description:
						'"editable" converts flowchart/graph into native tldraw shapes; "svg" renders any Mermaid syntax as crisp SVG; "auto" picks editable for flowcharts and svg for other diagram types.',
				},
				title: {
					type: Type.STRING,
					description: 'Optional diagram title.',
				},
			},
			required: ['code'],
		},
	},
	{
		name: 'create_kanban_board',
		description:
			'Create an interactive multi-column Kanban board using native tldraw column frames and draggable sticky-note task cards.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				title: { type: Type.STRING, description: 'Board heading (e.g., "Sprint 14 Kanban").' },
				columns: {
					type: Type.ARRAY,
					description: 'Ordered list of Kanban columns (e.g., Backlog, To Do, In Progress, Done).',
					items: {
						type: Type.OBJECT,
						properties: {
							name: { type: Type.STRING },
							color: { type: Type.STRING, enum: COLOR_VALUES },
							cards: {
								type: Type.ARRAY,
								items: {
									type: Type.OBJECT,
									properties: {
										text: { type: Type.STRING },
										color: { type: Type.STRING, enum: COLOR_VALUES },
									},
									required: ['text'],
								},
							},
						},
						required: ['name', 'cards'],
					},
				},
			},
			required: ['columns'],
		},
	},
	{
		name: 'add_kanban_card',
		description: 'Add a new sticky-note task card into an existing Kanban column frame on the canvas.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				column: {
					type: Type.STRING,
					description: 'Column frame name (e.g., "To Do", "In Progress") or frame shape ID.',
				},
				text: { type: Type.STRING, description: 'Task card text.' },
				color: { type: Type.STRING, enum: COLOR_VALUES },
			},
			required: ['column', 'text'],
		},
	},
	{
		name: 'create_document',
		description:
			'Create an interactive, editable rich-text document card directly on the canvas (supports Markdown content).',
		parameters: {
			type: Type.OBJECT,
			properties: {
				title: { type: Type.STRING, description: 'Document title.' },
				markdown: {
					type: Type.STRING,
					description: 'Document content formatted in Markdown (headings, lists, bold, quotes, paragraphs).',
				},
				w: { type: Type.NUMBER, description: 'Width in pixels. Default 640.' },
				h: { type: Type.NUMBER, description: 'Height in pixels. Default 520.' },
			},
			required: ['title', 'markdown'],
		},
	},
	{
		name: 'update_document',
		description:
			'Update the title and/or body content of an existing in-canvas document shape (specify shapeId or useSelected: true).',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeId: { type: Type.STRING, description: 'Target document shape ID.' },
				useSelected: { type: Type.BOOLEAN, description: 'Update the currently selected document shape.' },
				title: { type: Type.STRING, description: 'Updated document title.' },
				markdown: { type: Type.STRING, description: 'Updated Markdown body content.' },
			},
		},
	},
	{
		name: 'create_embed',
		description: 'Embed an external webpage/media URL (YouTube, Figma, CodePen, CodeSandbox, etc.) onto the canvas.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				url: { type: Type.STRING, description: 'URL to embed.' },
				w: { type: Type.NUMBER, description: 'Width in pixels. Default 560.' },
				h: { type: Type.NUMBER, description: 'Height in pixels. Default 360.' },
			},
			required: ['url'],
		},
	},
	{
		name: 'update_shape',
		description:
			'Update properties of one or more existing shapes (text/label, color, fill, geo type, size, width, height, or position). Pass shapeIds or useSelected: true.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				text: { type: Type.STRING },
				color: { type: Type.STRING, enum: COLOR_VALUES },
				fill: { type: Type.STRING, enum: FILL_VALUES },
				geo: { type: Type.STRING, enum: GEO_VALUES },
				size: { type: Type.STRING, enum: SIZE_VALUES },
				x: { type: Type.NUMBER },
				y: { type: Type.NUMBER },
				w: { type: Type.NUMBER },
				h: { type: Type.NUMBER },
			},
		},
	},
	{
		name: 'move_shapes',
		description: 'Move one or more existing shapes by a relative offset (dx, dy).',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				dx: { type: Type.NUMBER },
				dy: { type: Type.NUMBER },
			},
			required: ['dx', 'dy'],
		},
	},
	{
		name: 'delete_shapes',
		description: 'Delete specific shapes by ID, or delete the currently selected shapes.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
			},
		},
	},
	{
		name: 'arrange_shapes',
		description: 'Align, distribute, or organize shapes into a neat row, column, or grid.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				operation: {
					type: Type.STRING,
					enum: [
						'align-left',
						'align-center-horizontal',
						'align-right',
						'align-top',
						'align-center-vertical',
						'align-bottom',
						'distribute-horizontal',
						'distribute-vertical',
						'grid',
						'row',
						'column',
					],
				},
				gap: { type: Type.NUMBER },
			},
			required: ['operation'],
		},
	},
	{
		name: 'manage_shapes',
		description:
			'Perform structural editor operations on shapes: group, ungroup, toggle-lock, duplicate, bring-to-front, or send-to-back.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				useSelected: { type: Type.BOOLEAN },
				action: {
					type: Type.STRING,
					enum: ['group', 'ungroup', 'toggle-lock', 'duplicate', 'bring-to-front', 'send-to-back'],
				},
			},
			required: ['action'],
		},
	},
	{
		name: 'manage_page',
		description: 'Create a new page, switch to an existing page, or rename the current page.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				action: { type: Type.STRING, enum: ['create', 'switch', 'rename'] },
				name: { type: Type.STRING, description: 'Page name (for create, switch, or rename).' },
				pageId: { type: Type.STRING, description: 'Optional page ID for switching.' },
			},
			required: ['action'],
		},
	},
	{
		name: 'select_and_focus',
		description: 'Select specific shapes and/or pan & zoom the camera to frame them (or fit all shapes).',
		parameters: {
			type: Type.OBJECT,
			properties: {
				shapeIds: { type: Type.ARRAY, items: { type: Type.STRING } },
				fitAll: { type: Type.BOOLEAN },
			},
		},
	},
]
