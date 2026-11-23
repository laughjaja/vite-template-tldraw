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
import { ColorStudioPopover } from '../features/colors/ColorStudioPopover'
import { getSlotDisplayHex, type UserColorSettings } from '../features/colors/colorUtils'

export interface BottomToolDef {
	id: string
	label: string
	shortcut: string
	icon: string
	toolId: string
	geo?: TLGeoShapeGeoStyle
}

export const ALL_BOTTOM_TOOLS: BottomToolDef[] = [
	{ id: 'select', label: 'Select', shortcut: 'V', icon: '↖', toolId: 'select' },
	{ id: 'hand', label: 'Hand', shortcut: 'H', icon: '✋', toolId: 'hand' },
	{ id: 'draw', label: 'Draw', shortcut: 'D', icon: '✎', toolId: 'draw' },
	{ id: 'highlight', label: 'Highlight', shortcut: 'Shift+D', icon: '🖍', toolId: 'highlight' },
	{ id: 'eraser', label: 'Eraser', shortcut: 'E', icon: '⌫', toolId: 'eraser' },
	{ id: 'arrow', label: 'Arrow', shortcut: 'A', icon: '↗', toolId: 'arrow' },
	{ id: 'line', label: 'Line', shortcut: 'L', icon: '╱', toolId: 'line' },
	{ id: 'text', label: 'Text', shortcut: 'T', icon: 'T', toolId: 'text' },
	{ id: 'note', label: 'Note', shortcut: 'N', icon: '🗒', toolId: 'note' },
	{ id: 'geo-rect', label: 'Rect', shortcut: 'R', icon: '▭', toolId: 'geo', geo: 'rectangle' },
	{ id: 'geo-oval', label: 'Ellipse', shortcut: 'O', icon: '◯', toolId: 'geo', geo: 'ellipse' },
	{ id: 'geo-diamond', label: 'Diamond', shortcut: '', icon: '◇', toolId: 'geo', geo: 'diamond' },
	{ id: 'geo-triangle', label: 'Triangle', shortcut: '', icon: '△', toolId: 'geo', geo: 'triangle' },
	{ id: 'geo-star', label: 'Star', shortcut: '', icon: '☆', toolId: 'geo', geo: 'star' },
	{ id: 'geo-cloud', label: 'Cloud', shortcut: '', icon: '☁', toolId: 'geo', geo: 'cloud' },
	{ id: 'geo-hexagon', label: 'Hexagon', shortcut: '', icon: '⬡', toolId: 'geo', geo: 'hexagon' },
	{ id: 'geo-check', label: 'Check', shortcut: '', icon: '☑', toolId: 'geo', geo: 'check-box' },
	{ id: 'geo-heart', label: 'Heart', shortcut: '', icon: '♡', toolId: 'geo', geo: 'heart' },
	{ id: 'frame', label: 'Frame', shortcut: 'F', icon: '⊞', toolId: 'frame' },
	{ id: 'laser', label: 'Laser', shortcut: 'K', icon: '✦', toolId: 'laser' },
]

const DEFAULT_ENABLED_TOOL_IDS = [
	'select',
	'hand',
	'draw',
	'highlight',
	'eraser',
	'arrow',
	'line',
	'text',
	'note',
	'geo-rect',
	'geo-oval',
	'geo-diamond',
	'frame',
	'laser',
]

const TOOLBAR_STORAGE_KEY = 'jastldraw-bottom-tools-v1'

function loadSavedToolIds(): string[] {
	try {
		const raw = localStorage.getItem(TOOLBAR_STORAGE_KEY)
		if (!raw) return DEFAULT_ENABLED_TOOL_IDS
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return DEFAULT_ENABLED_TOOL_IDS
		const valid = parsed.filter(
			(id): id is string => typeof id === 'string' && ALL_BOTTOM_TOOLS.some((t) => t.id === id)
		)
		return valid.length > 0 ? valid : DEFAULT_ENABLED_TOOL_IDS
	} catch {
		return DEFAULT_ENABLED_TOOL_IDS
	}
}

const SIZES: TLDefaultSizeStyle[] = ['s', 'm', 'l', 'xl']
const FILLS: Array<{ id: TLDefaultFillStyle; label: string }> = [
	{ id: 'none', label: 'None' },
	{ id: 'semi', label: 'Semi' },
	{ id: 'solid', label: 'Solid' },
]

interface BottomToolbarProps {
	editor: Editor | null
	isDark: boolean
	colorSettings: UserColorSettings
	onColorSettingsChange: (next: UserColorSettings) => void
}

export function BottomToolbar({
	editor,
	isDark,
	colorSettings,
	onColorSettingsChange,
}: BottomToolbarProps) {
	const [enabledIds, setEnabledIds] = useState<string[]>(() => loadSavedToolIds())
	const [activeTool, setActiveTool] = useState<string>('select')
	const [activeGeo, setActiveGeo] = useState<TLGeoShapeGeoStyle>('rectangle')
	const [activeColor, setActiveColor] = useState<TLDefaultColorStyle>(colorSettings.defaultColor)
	const [activeSize, setActiveSize] = useState<TLDefaultSizeStyle>('m')
	const [activeFill, setActiveFill] = useState<TLDefaultFillStyle>('none')
	const [canUndo, setCanUndo] = useState(false)
	const [canRedo, setCanRedo] = useState(false)
	const [colorOpen, setColorOpen] = useState(false)
	const [customizeOpen, setCustomizeOpen] = useState(false)

	useEffect(() => {
		try {
			localStorage.setItem(TOOLBAR_STORAGE_KEY, JSON.stringify(enabledIds))
		} catch {
			// Ignore quota errors
		}
	}, [enabledIds])

	useEffect(() => {
		if (!editor) return
		const sync = () => {
			setActiveTool(editor.getCurrentToolId())
			setCanUndo(editor.getCanUndo())
			setCanRedo(editor.getCanRedo())
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

	const selectTool = (item: BottomToolDef) => {
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

	const cycleSize = () => {
		if (!editor) return
		const next = SIZES[(SIZES.indexOf(activeSize) + 1) % SIZES.length]
		editor.setStyleForNextShapes(DefaultSizeStyle, next)
		if (editor.getSelectedShapeIds().length > 0) {
			editor.setStyleForSelectedShapes(DefaultSizeStyle, next)
		}
		setActiveSize(next)
	}

	const cycleFill = () => {
		if (!editor) return
		const curIdx = FILLS.findIndex((f) => f.id === activeFill)
		const next = FILLS[(curIdx + 1) % FILLS.length].id
		editor.setStyleForNextShapes(DefaultFillStyle, next)
		if (editor.getSelectedShapeIds().length > 0) {
			editor.setStyleForSelectedShapes(DefaultFillStyle, next)
		}
		setActiveFill(next)
	}

	const toggleToolVisible = (id: string) => {
		setEnabledIds((prev) => {
			if (prev.includes(id)) {
				if (prev.length <= 1) return prev // Always keep at least 1 tool
				return prev.filter((t) => t !== id)
			}
			return [...prev, id]
		})
	}

	const moveTool = (id: string, delta: -1 | 1) => {
		setEnabledIds((prev) => {
			const idx = prev.indexOf(id)
			if (idx === -1) return prev
			const target = idx + delta
			if (target < 0 || target >= prev.length) return prev
			const next = [...prev]
			;[next[idx], next[target]] = [next[target], next[idx]]
			return next
		})
	}

	const visibleTools = enabledIds
		.map((id) => ALL_BOTTOM_TOOLS.find((t) => t.id === id))
		.filter((t): t is BottomToolDef => Boolean(t))

	const activeHex = getSlotDisplayHex(activeColor, colorSettings.overrides, isDark)
	const activeFillLabel = FILLS.find((f) => f.id === activeFill)?.label ?? 'None'

	return (
		<div
			className="bottom-dock-wrap"
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			{colorOpen && (
				<ColorStudioPopover
					editor={editor}
					activeColor={activeColor}
					isDark={isDark}
					settings={colorSettings}
					onSettingsChange={onColorSettingsChange}
					onSelectColor={applyColor}
					onClose={() => setColorOpen(false)}
				/>
			)}

			{customizeOpen && (
				<div className="customize-popover">
					<div className="customize-head">
						<div>
							<strong>Customize Bottom Toolbar</strong>
							<span className="ws-muted">Pick, remove, or reorder tools</span>
						</div>
						<div className="ws-header-btns">
							<button
								type="button"
								className="ws-btn ws-btn-sm"
								onClick={() => setEnabledIds(DEFAULT_ENABLED_TOOL_IDS)}
							>
								Reset
							</button>
							<button
								type="button"
								className="ws-btn ws-btn-sm"
								onClick={() => setCustomizeOpen(false)}
							>
								Done
							</button>
						</div>
					</div>
					<div className="customize-list">
						{ALL_BOTTOM_TOOLS.map((tool) => {
							const idx = enabledIds.indexOf(tool.id)
							const isOn = idx !== -1
							return (
								<div key={tool.id} className={`customize-item ${isOn ? 'on' : ''}`}>
									<label className="customize-check">
										<input
											type="checkbox"
											checked={isOn}
											onChange={() => toggleToolVisible(tool.id)}
										/>
										<span className="customize-icon">{tool.icon}</span>
										<span>{tool.label}</span>
									</label>
									{isOn && (
										<div className="customize-order">
											<button
												type="button"
												disabled={idx === 0}
												onClick={() => moveTool(tool.id, -1)}
												title="Move left"
											>
												←
											</button>
											<button
												type="button"
												disabled={idx === enabledIds.length - 1}
												onClick={() => moveTool(tool.id, 1)}
												title="Move right"
											>
												→
											</button>
										</div>
									)}
								</div>
							)
						})}
					</div>
				</div>
			)}

			<div className="bottom-dock" role="toolbar" aria-label="Canvas drawing tools">
				<div className="bottom-dock-group">
					<button
						type="button"
						className="bottom-tool-btn compact"
						disabled={!canUndo}
						onClick={() => editor?.undo()}
						title="Undo (Ctrl+Z)"
					>
						<span>↶</span>
					</button>
					<button
						type="button"
						className="bottom-tool-btn compact"
						disabled={!canRedo}
						onClick={() => editor?.redo()}
						title="Redo (Ctrl+Shift+Z)"
					>
						<span>↷</span>
					</button>
				</div>

				<span className="bottom-dock-divider" />

				<div className="bottom-dock-tools">
					{visibleTools.map((item) => {
						const isActive =
							item.toolId === 'geo'
								? activeTool === 'geo' && activeGeo === item.geo
								: activeTool === item.toolId
						return (
							<button
								key={item.id}
								type="button"
								className={`bottom-tool-btn ${isActive ? 'active' : ''}`}
								onClick={() => selectTool(item)}
								title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
							>
								<span className="bottom-tool-icon" aria-hidden="true">
									{item.icon}
								</span>
								<span className="bottom-tool-label">{item.label}</span>
							</button>
						)
					})}
				</div>

				<span className="bottom-dock-divider" />

				<div className="bottom-dock-group">
					<button
						type="button"
						className={`bottom-tool-btn ${colorOpen ? 'active' : ''}`}
						onClick={() => {
							setColorOpen((v) => !v)
							setCustomizeOpen(false)
						}}
						title={`Color: ${activeColor} (${activeHex.toUpperCase()}) — Click for Color Wheel, HEX & RGB`}
					>
						<span className="bottom-color-swatch" style={{ backgroundColor: activeHex }} />
						<span className="bottom-tool-label">Color</span>
					</button>

					<button
						type="button"
						className="bottom-tool-btn compact"
						onClick={cycleSize}
						title="Cycle stroke/text size (S / M / L / XL)"
					>
						<span className="bottom-tool-icon">{activeSize.toUpperCase()}</span>
						<span className="bottom-tool-label">Size</span>
					</button>

					<button
						type="button"
						className="bottom-tool-btn compact"
						onClick={cycleFill}
						title="Cycle shape fill (None / Semi / Solid)"
					>
						<span className="bottom-tool-icon">◐</span>
						<span className="bottom-tool-label">{activeFillLabel}</span>
					</button>

					<button
						type="button"
						className={`bottom-tool-btn compact ${customizeOpen ? 'active' : ''}`}
						onClick={() => {
							setCustomizeOpen((v) => !v)
							setColorOpen(false)
						}}
						title="Customize bottom toolbar (add, remove, or reorder tools)"
					>
						<span className="bottom-tool-icon">⚙</span>
						<span className="bottom-tool-label">Edit</span>
					</button>
				</div>
			</div>
		</div>
	)
}
