import { TodoId } from './ids-schema.ts'

export interface TodoItem {
	id: TodoId
	text: string
	status: 'todo' | 'in-progress' | 'done'
}
