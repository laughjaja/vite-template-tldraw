import { SimpleShapeId } from './ids-schema.ts'

export interface AgentCanvasLint {
	type: AgentCanvasLintType
	shapeIds: SimpleShapeId[]
}

export type AgentCanvasLintType = 'growY-on-shape' | 'overlapping-text' | 'friendless-arrow'
