import { AtIcon } from './AtIcon.tsx'
import { BrainIcon } from './BrainIcon.tsx'
import { ChevronDownIcon } from './ChevronDownIcon.tsx'
import { ChevronRightIcon } from './ChevronRightIcon.tsx'
import { CommentIcon } from './CommentIcon.tsx'
import { CrossIcon } from './CrossIcon.tsx'
import { CursorIcon } from './CursorIcon.tsx'
import { EllipsisIcon } from './EllipsisIcon.tsx'
import { EyeIcon } from './EyeIcon.tsx'
import { NoteIcon } from './NoteIcon.tsx'
import { PencilIcon } from './PencilIcon.tsx'
import { RefreshIcon } from './RefreshIcon.tsx'
import { SearchIcon } from './SearchIcon.tsx'
import { TargetIcon } from './TargetIcon.tsx'
import { TrashIcon } from './TrashIcon.tsx'

const AGENT_ICONS = {
	'chevron-down': <ChevronDownIcon />,
	'chevron-right': <ChevronRightIcon />,
	at: <AtIcon />,
	brain: <BrainIcon />,
	comment: <CommentIcon />,
	cross: <CrossIcon />,
	cursor: <CursorIcon />,
	ellipsis: <EllipsisIcon />,
	eye: <EyeIcon />,
	note: <NoteIcon />,
	pencil: <PencilIcon />,
	refresh: <RefreshIcon />,
	search: <SearchIcon />,
	target: <TargetIcon />,
	trash: <TrashIcon />,
}

export type AgentIconType = keyof typeof AGENT_ICONS

export function AgentIcon({ type }: { type: AgentIconType }) {
	return AGENT_ICONS[type]
}
