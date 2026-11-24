import { FocusedShape } from './FocusedShape.ts'

export interface BlurryShape {
	shapeId: string
	text?: string
	type: FocusedShape['_type']
	x: number
	y: number
	w: number
	h: number
}
