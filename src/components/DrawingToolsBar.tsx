import { useEffect, useState } from 'react'
import {
	DefaultColorStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	GeoShapeGeoStyle,
	type Editor,
	type TLDefaultColorStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
	type TLGeoShapeGeoStyle,
} from 'tldraw'

interface DrawingToolsBarProps {
	editor: Editor | null
}

interface ToolItem {
	id: string
	label: string
	shortcut: string
	icon: string
	toolId: string
	geo?: TLGeoShapeGeoStyle
}

const TOOLS: ToolItem[] = [
	{ id: 'select', label: 'Select', shortcut: 'V', icon: '↖', toolId: 'select' },
	{ id: 'hand', label: 'Hand / Pan', shortcut: 'H', icon: '✋', toolId: 'hand' },
	{ id: 'draw', label: 'Draw / Pen', shortcut: 'D', icon: '✎', toolId: 'draw' },
	{ id: 'highlight', label: 'Highlighter', shortcut: 'Shift+D', icon: '🖍', toolId: 'highlight' },
	{ id: 'eraser', label: 'Eraser', shortcut: 'E', icon: '⌫', toolId: 'eraser' },
	{ id: 'arrow', label: 'Arrow', shortcut: 'A', icon: '↗', toolId: 'arrow' },
	{ id: 'line', label: 'Line', shortcut: 'L', icon: '╱', toolId: 'line' },
	{ id: 'text', label: 'Text', shortcut: 'T', icon: 'T', toolId: 'text' },
	{ id: 'note', label: 'Sticky Note', shortcut: 'N', icon: '🗒', toolId: 'note' },
	{ id: 'geo-rect', label: 'Rectangle', shortcut: 'R', icon: '▭', toolId: 'geo', geo: 'rectangle' },
	{ id: 'geo-oval', label: 'Ellipse', shortcut: 'O', icon: '◯', toolId: 'geo', geo: 'ellipse' },
	{ id: 'geo-diamond', label: 'Diamond', shortcut: '', icon: '◇', toolId: 'geo', geo: 'diamond' },
	{ id: 'frame', label: 'Frame', shortcut: 'F', icon: '⊞', toolId: 'frame' },
	{ id: 'laser', label: 'Laser Pointer', shortcut: 'K', icon: '✦', toolId: 'laser' },
]

const COLOR_SWATCHES: Array<{ name: TLDefaultColorStyle; hex: string }> = [
	{ name: 'black', hex: '#1d1d1d' },
	{ name: 'blue', hex: '#2563eb' },
	{ name: 'red', hex: '#dc2626' },
	{ name: 'green', hex: '#16a34a' },
	{ name: 'orange', hex: '#ea580c' },
	{ name: 'violet', hex: '#7c3aed' },
	{ name: 'yellow', hex: '#eab308' },
	{ name: 'grey', hex: '#6b7280' },
]

const SIZES: TLDefaultSizeStyle[] = ['s', 'm', 'l', 'xl']
const FILLS: Array<{ id: TLDefaultFillStyle; label: string }> = [
	{ id: 'none', label: 'None' },
	{ id: 'semi', label: 'Semi' },
	{ id: 'solid', label: 'Solid' },
]

export function DrawingToolsBar({ editor }: DrawingToolsBarProps) {
	const [activeTool, setActiveTool] = useState<string>('select')
	const [activeGeo, setActiveGeo] = useState<TLGeoShapeGeoStyle>('rectangle')
	const [activeColor, setActiveColor] = useState<TLDefaultColorStyle>('black')
	const [activeSize, setActiveSize] = useState<TLDefaultSizeStyle>('m')
	const [activeFill, setActiveFill] = useState<TLDefaultFillStyle>('none')
	const [canUndo, setCanUndo] = useState(false)
	const [canRedo, setCanRedo] = useState(false)
	const [isReadonly, setIsReadonly] = useState(false)
	const [collapsed, setCollapsed] = useState(false)

	useEffect(() => {
		if (!editor) return

		const sync = () => {
			setActiveTool(editor.getCurrentToolId())
			setCanUndo(editor.getCanUndo())
			setCanRedo(editor.getCanRedo())
			setIsReadonly(editor.getInstanceState().isReadonly)

			const styles = editor.getInstanceState().stylesForNextShape
			const nextGeo = styles[GeoShapeGeoStyle.id] as TLGeoShapeGeoStyle | undefined
			const nextColor = styles[DefaultColorStyle.id] as TLDefaultColorStyle | undefined
			const nextSize = styles[DefaultSizeStyle.id] as TLDefaultSizeStyle | undefined
			const nextFill = styles[DefaultFillStyle.id] as TLDefaultFillStyle | undefined
			if (nextGeo) setActiveGeo(nextGeo)
			if (nextColor) setActiveColor(nextColor)
			if (nextSize) setActiveSize(nextSize)
			if (nextFill) setActiveFill(nextFill)
		}

		sync()
		const unsub = editor.store.listen(sync, { scope: 'all' })
		return () => unsub()
	}, [editor])

	const selectTool = (item: ToolItem) => {
		if (!editor) return
		if (editor.getInstanceState().isReadonly) {
			editor.updateInstanceState({ isReadonly: false })
		}
		if (item.geo) {
			editor.setStyleForNextShapes(GeoShapeGeoStyle, item.geo)
			setActiveGeo(item.geo)
		}
		editor.setCurrentTool(item.toolId)
		setActiveTool(item.toolId)
	}

	const applyColor = (color: TLDefaultColorStyle) => {
		if (!editor) return
		editor.setStyleForNextShapes(DefaultColorStyle, color)
		if (editor.getSelectedShapeIds().length > 0) {
			editor.setStyleForSelectedShapes(DefaultColorStyle, color)
		}
		setActiveColor(color)
	}

	const applySize = (size: TLDefaultSizeStyle) => {
		if (!editor) return
		editor.setStyleForNextShapes(DefaultSizeStyle, size)
		if (editor.getSelectedShapeIds().length > 0) {
			editor.setStyleForSelectedShapes(DefaultSizeStyle, size)
		}
		setActiveSize(size)
	}

	const applyFill = (fill: TLDefaultFillStyle) => {
		if (!editor) return
		editor.setStyleForNextShapes(DefaultFillStyle, fill)
		if (editor.getSelectedShapeIds().length > 0) {
			editor.setStyleForSelectedShapes(DefaultFillStyle, fill)
		}
		setActiveFill(fill)
	}

	if (collapsed) {
		return (
			<aside className="draw-dock collapsed" aria-label="Drawing tools" onKeyDown={(e) => e.stopPropagation()}>
				<button
					type="button"
					className="draw-dock-toggle"
					onClick={() => setCollapsed(false)}
					title="Show drawing tools"
				>
					✎ Tools
				</button>
			</aside>
		)
	}

	return (
		<aside className="draw-dock" aria-label="Drawing tools" onKeyDown={(e) => e.stopPropagation()}>
			<div className="draw-dock-head">
				<span>Tools</span>
				<button
					type="button"
					className="draw-dock-min"
					onClick={() => setCollapsed(true)}
					title="Collapse tools rail"
				>
					⟨
				</button>
			</div>

			{isReadonly && (
				<button
					type="button"
					className="draw-readonly-unlock"
					onClick={() => editor?.updateInstanceState({ isReadonly: false })}
				>
					Unlock drawing
				</button>
			)}

			<div className="draw-tools-grid">
				{TOOLS.map((item) => {
					const isActive =
						item.toolId === 'geo'
							? activeTool === 'geo' && activeGeo === item.geo
							: activeTool === item.toolId
					return (
						<button
							key={item.id}
							type="button"
							className={`draw-tool-btn ${isActive ? 'active' : ''}`}
							onClick={() => selectTool(item)}
							title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
						>
							<span className="draw-tool-icon" aria-hidden="true">
								{item.icon}
							</span>
							<span className="draw-tool-label">{item.label.split(' ')[0]}</span>
						</button>
					)
				})}
			</div>

			<div className="draw-section">
				<div className="draw-section-label">Color</div>
				<div className="draw-swatches">
					{COLOR_SWATCHES.map((swatch) => (
						<button
							key={swatch.name}
							type="button"
							className={`draw-swatch ${activeColor === swatch.name ? 'active' : ''}`}
							style={{ backgroundColor: swatch.hex }}
							onClick={() => applyColor(swatch.name)}
							title={swatch.name}
							aria-label={`Color ${swatch.name}`}
						/>
					))}
				</div>
			</div>

			<div className="draw-section">
				<div className="draw-section-label">Size</div>
				<div className="draw-pill-row">
					{SIZES.map((s) => (
						<button
							key={s}
							type="button"
							className={`draw-pill ${activeSize === s ? 'active' : ''}`}
							onClick={() => applySize(s)}
						>
							{s.toUpperCase()}
						</button>
					))}
				</div>
			</div>

			<div className="draw-section">
				<div className="draw-section-label">Fill</div>
				<div className="draw-pill-row">
					{FILLS.map((f) => (
						<button
							key={f.id}
							type="button"
							className={`draw-pill ${activeFill === f.id ? 'active' : ''}`}
							onClick={() => applyFill(f.id)}
						>
							{f.label}
						</button>
					))}
				</div>
			</div>

			<div className="draw-section draw-history-row">
				<button
					type="button"
					className="draw-pill"
					disabled={!canUndo}
					onClick={() => editor?.undo()}
					title="Undo (Ctrl+Z)"
				>
					↶ Undo
				</button>
				<button
					type="button"
					className="draw-pill"
					disabled={!canRedo}
					onClick={() => editor?.redo()}
					title="Redo (Ctrl+Shift+Z)"
				>
					↷ Redo
				</button>
			</div>
		</aside>
	)
}
