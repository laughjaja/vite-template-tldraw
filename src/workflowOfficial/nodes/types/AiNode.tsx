import { T, useEditor } from 'tldraw'
import { EarthquakeIcon } from '../../components/icons/EarthquakeIcon'
import {
	NODE_HEADER_HEIGHT_PX,
	NODE_ROW_HEADER_GAP_PX,
	NODE_ROW_HEIGHT_PX,
	NODE_WIDTH_PX,
} from '../../constants'
import { ShapePort } from '../../ports/Port'
import { NodeShape } from '../NodeShapeUtil'
import {
	areAnyInputsOutOfDate,
	ExecutionResult,
	InfoValues,
	InputValues,
	NodeComponentProps,
	NodeDefinition,
	NodeInputRow,
	NodeRow,
	updateNode,
} from './shared'

export type AiNode = T.TypeOf<typeof AiNode>
export const AiNode = T.object({
	type: T.literal('ai'),
	instruction: T.string,
	inputValue: T.number,
	lastResult: T.number.nullable(),
})

export class AiNodeDefinition extends NodeDefinition<AiNode> {
	static type = 'ai'
	static validator = AiNode
	title = 'AI'
	heading = 'AI step'
	icon = <EarthquakeIcon />

	getDefault(): AiNode {
		return {
			type: 'ai',
			instruction: 'Return the input unchanged.',
			inputValue: 0,
			lastResult: null,
		}
	}

	getBodyHeightPx() {
		return NODE_ROW_HEIGHT_PX * 2
	}

	getPorts(): Record<string, ShapePort> {
		return {
			output: {
				id: 'output',
				x: NODE_WIDTH_PX,
				y: NODE_HEADER_HEIGHT_PX / 2,
				terminal: 'start',
			},
			input: {
				id: 'input',
				x: 0,
				y: NODE_HEADER_HEIGHT_PX + NODE_ROW_HEADER_GAP_PX + NODE_ROW_HEIGHT_PX * 1.5,
				terminal: 'end',
			},
		}
	}

	async execute(shape: NodeShape, node: AiNode, inputs: InputValues): Promise<ExecutionResult> {
		const response = await fetch('/api/workflow/ai', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				nodeType: 'ai',
				input: {
					instruction: node.instruction,
					value: inputs.input ?? node.inputValue,
				},
			}),
		})
		const result = (await response.json()) as { result?: unknown; error?: string }
		if (!response.ok) throw Error(result.error || 'Workflow AI step failed.')
		if (typeof result.result !== 'number' || !Number.isFinite(result.result)) throw Error('AI step returned an invalid numeric result.')
		const value = result.result
		updateNode<AiNode>(this.editor, shape, (current) => ({ ...current, lastResult: value }))
		return { output: value }
	}

	getOutputInfo(shape: NodeShape, node: AiNode, inputs: InfoValues): InfoValues {
		return {
			output: {
				value: node.lastResult ?? 0,
				isOutOfDate: areAnyInputsOutOfDate(inputs) || shape.props.isOutOfDate,
			},
		}
	}

	Component = AiNodeComponent
}

export function AiNodeComponent({ shape, node }: NodeComponentProps<AiNode>) {
	const editor = useEditor()
	return (
		<>
			<NodeRow>
				<input
					value={node.instruction}
					onChange={(event) =>
						updateNode<AiNode>(editor, shape, (current) => ({
							...current,
							instruction: event.target.value,
						}))
					}
				/>
			</NodeRow>
			<NodeInputRow
				shapeId={shape.id}
				portId="input"
				value={node.inputValue}
				onChange={(inputValue) =>
					updateNode<AiNode>(editor, shape, (current) => ({ ...current, inputValue }))
				}
			/>
		</>
	)
}
