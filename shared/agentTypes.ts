export type AgentToolName =
	| 'create_shape'
	| 'create_connector'
	| 'create_flowchart'
	| 'create_mermaid_diagram'
	| 'create_kanban_board'
	| 'add_kanban_card'
	| 'create_document'
	| 'update_document'
	| 'create_embed'
	| 'update_shape'
	| 'move_shapes'
	| 'delete_shapes'
	| 'arrange_shapes'
	| 'manage_shapes'
	| 'manage_page'
	| 'select_and_focus'

export interface CanvasViewportSummary {
	x: number
	y: number
	w: number
	h: number
	centerX: number
	centerY: number
}

export interface CanvasShapeSummary {
	id: string
	type: string
	x: number
	y: number
	w: number
	h: number
	text?: string
	geo?: string
	color?: string
	fill?: string
	size?: string
	frameName?: string
	fromShapeId?: string
	toShapeId?: string
	parentId?: string
	isLocked?: boolean
	selected: boolean
}

export interface CanvasPageSummary {
	id: string
	name: string
	isCurrent: boolean
}

export interface CanvasContextSnapshot {
	pageId: string
	pageName: string
	pages?: CanvasPageSummary[]
	editorState?: {
		isGridMode: boolean
		isReadonly: boolean
		isSnapMode: boolean
		colorScheme: string
	}
	viewport: CanvasViewportSummary
	totalShapeCount: number
	selectedShapeIds: string[]
	shapes: CanvasShapeSummary[]
	screenshotBase64?: string
}

export interface ChatTurnMessage {
	role: 'user' | 'assistant'
	text: string
	actionsSummary?: string
}

export interface AgentToolCall {
	id: string
	name: AgentToolName
	args: Record<string, unknown>
}

export interface AgentToolResult {
	id: string
	name: AgentToolName
	ok: boolean
	summary: string
	createdIds?: Record<string, string>
	affectedIds?: string[]
	error?: string
}

export interface AgentContinuation {
	modelParts: unknown[]
	toolResults: AgentToolResult[]
}

export interface AgentChatRequest {
	message: string
	history: ChatTurnMessage[]
	canvasContext: CanvasContextSnapshot
	model?: string
	continuations?: AgentContinuation[]
}

export type AgentStreamEvent =
	| {
			type: 'status'
			phase: 'thinking' | 'streaming' | 'acting'
			detail?: string
	  }
	| {
			type: 'text'
			delta: string
	  }
	| {
			type: 'tool_calls'
			calls: AgentToolCall[]
			modelParts: unknown[]
	  }
	| {
			type: 'done'
			model: string
	  }
	| {
			type: 'error'
			message: string
	  }

export interface AgentHealthResponse {
	ok: boolean
	apiKeyConfigured: boolean
	model: string
	availableModels: string[]
	message?: string
}
