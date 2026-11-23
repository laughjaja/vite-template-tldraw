import { useEffect, useRef, useState } from 'react'
import { DefaultColorStyle, type Editor, type TLDefaultColorStyle } from 'tldraw'
import {
	ALL_COLOR_SLOTS,
	PALETTE_PRESETS,
	applyColorSettingsToEditor,
	clampByte,
	getSlotDisplayHex,
	hexToRgb,
	hslToHex,
	normalizeHex,
	rgbToHex,
	rgbToHsl,
	saveUserColorSettings,
	type UserColorSettings,
} from './colorUtils'

interface ColorStudioPopoverProps {
	editor: Editor | null
	activeColor: TLDefaultColorStyle
	isDark: boolean
	settings: UserColorSettings
	onSettingsChange: (next: UserColorSettings) => void
	onSelectColor: (color: TLDefaultColorStyle) => void
	onClose: () => void
}

const WHEEL_SIZE = 148

export function ColorStudioPopover({
	editor,
	activeColor,
	isDark,
	settings,
	onSettingsChange,
	onSelectColor,
	onClose,
}: ColorStudioPopoverProps) {
	const currentHex = getSlotDisplayHex(activeColor, settings.overrides, isDark)
	const rgb = hexToRgb(currentHex)
	const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)

	const [hexDraft, setHexDraft] = useState(currentHex.toUpperCase())
	const [lightness, setLightness] = useState(hsl.l)
	const [copied, setCopied] = useState<string | null>(null)
	const wheelCanvasRef = useRef<HTMLCanvasElement | null>(null)
	const draggingRef = useRef(false)

	useEffect(() => {
		setHexDraft(currentHex.toUpperCase())
		const cRgb = hexToRgb(currentHex)
		setLightness(rgbToHsl(cRgb.r, cRgb.g, cRgb.b).l)
	}, [currentHex, activeColor])

	// Render interactive HSL color wheel onto canvas
	useEffect(() => {
		const canvas = wheelCanvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const radius = WHEEL_SIZE / 2
		const img = ctx.createImageData(WHEEL_SIZE, WHEEL_SIZE)
		const data = img.data

		for (let y = 0; y < WHEEL_SIZE; y++) {
			for (let x = 0; x < WHEEL_SIZE; x++) {
				const dx = x - radius
				const dy = y - radius
				const dist = Math.sqrt(dx * dx + dy * dy)
				const idx = (y * WHEEL_SIZE + x) * 4

				if (dist <= radius) {
					const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
					const sat = Math.min(100, (dist / radius) * 100)
					const hex = hslToHex(angle, sat, lightness)
					const c = hexToRgb(hex)
					data[idx] = c.r
					data[idx + 1] = c.g
					data[idx + 2] = c.b
					data[idx + 3] = 255
				} else {
					data[idx + 3] = 0
				}
			}
		}
		ctx.putImageData(img, 0, 0)

		// Draw indicator dot for current hue/sat
		const rad = (hsl.h * Math.PI) / 180
		const rDist = (hsl.s / 100) * (radius - 4)
		const px = radius + Math.cos(rad) * rDist
		const py = radius + Math.sin(rad) * rDist
		ctx.beginPath()
		ctx.arc(px, py, 6, 0, Math.PI * 2)
		ctx.lineWidth = 2.5
		ctx.strokeStyle = '#ffffff'
		ctx.stroke()
		ctx.beginPath()
		ctx.arc(px, py, 7.2, 0, Math.PI * 2)
		ctx.lineWidth = 1
		ctx.strokeStyle = 'rgba(0,0,0,0.45)'
		ctx.stroke()
	}, [lightness, hsl.h, hsl.s])

	const updateSlotHex = (nextHex: string) => {
		const norm = normalizeHex(nextHex)
		if (!norm) return
		const nextSettings: UserColorSettings = {
			...settings,
			overrides: {
				...settings.overrides,
				[activeColor]: norm,
			},
		}
		saveUserColorSettings(nextSettings)
		onSettingsChange(nextSettings)
		if (editor) {
			applyColorSettingsToEditor(editor, nextSettings, false)
		}
	}

	const pickFromWheelEvent = (clientX: number, clientY: number) => {
		const canvas = wheelCanvasRef.current
		if (!canvas) return
		const rect = canvas.getBoundingClientRect()
		const radius = rect.width / 2
		const dx = clientX - (rect.left + radius)
		const dy = clientY - (rect.top + radius)
		const dist = Math.min(radius, Math.sqrt(dx * dx + dy * dy))
		const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
		const sat = Math.round((dist / radius) * 100)
		const nextHex = hslToHex(angle, sat, Math.max(12, Math.min(88, lightness || 50)))
		updateSlotHex(nextHex)
	}

	const handleSetDefault = () => {
		const nextSettings: UserColorSettings = {
			...settings,
			defaultColor: activeColor,
		}
		saveUserColorSettings(nextSettings)
		onSettingsChange(nextSettings)
		if (editor) {
			editor.setStyleForNextShapes(DefaultColorStyle, activeColor)
		}
	}

	const handleApplyPreset = (overrides: Partial<Record<TLDefaultColorStyle, string>>) => {
		const nextSettings: UserColorSettings = {
			...settings,
			overrides: { ...overrides },
		}
		saveUserColorSettings(nextSettings)
		onSettingsChange(nextSettings)
		if (editor) {
			applyColorSettingsToEditor(editor, nextSettings, false)
		}
	}

	const handleResetSlot = () => {
		const nextOverrides = { ...settings.overrides }
		delete nextOverrides[activeColor]
		handleApplyPreset(nextOverrides)
	}

	const copyCode = async (label: string, value: string) => {
		try {
			await navigator.clipboard.writeText(value)
			setCopied(label)
			window.setTimeout(() => setCopied((cur) => (cur === label ? null : cur)), 1400)
		} catch {
			// Ignore clipboard failures
		}
	}

	const rgbString = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`

	return (
		<div
			className="color-studio-popover"
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<div className="color-studio-head">
				<div>
					<strong>Colors &amp; Color Wheel</strong>
					<span className="ws-muted">
						Editing <code>{activeColor}</code>
						{settings.defaultColor === activeColor ? ' · Default' : ''}
					</span>
				</div>
				<button type="button" className="ws-btn ws-btn-sm" onClick={onClose}>
					✕
				</button>
			</div>

			{/* 13 Palette Swatches */}
			<div className="color-studio-swatches">
				{ALL_COLOR_SLOTS.map((slot) => {
					const hex = getSlotDisplayHex(slot, settings.overrides, isDark)
					const isDef = settings.defaultColor === slot
					return (
						<button
							key={slot}
							type="button"
							className={`color-studio-dot ${activeColor === slot ? 'active' : ''}`}
							style={{ backgroundColor: hex }}
							title={`${slot} (${hex.toUpperCase()})${isDef ? ' — Default' : ''}`}
							onClick={() => onSelectColor(slot)}
						>
							{isDef ? <span className="color-default-star">★</span> : null}
						</button>
					)
				})}
			</div>

			{/* Color Wheel + Brightness + HEX/RGB */}
			<div className="color-studio-wheel-row">
				<div className="color-wheel-wrap">
					<canvas
						ref={wheelCanvasRef}
						width={WHEEL_SIZE}
						height={WHEEL_SIZE}
						className="color-wheel-canvas"
						onPointerDown={(e) => {
							draggingRef.current = true
							e.currentTarget.setPointerCapture(e.pointerId)
							pickFromWheelEvent(e.clientX, e.clientY)
						}}
						onPointerMove={(e) => {
							if (draggingRef.current) {
								pickFromWheelEvent(e.clientX, e.clientY)
							}
						}}
						onPointerUp={() => {
							draggingRef.current = false
						}}
					/>
					<label className="color-lightness-row">
						<span>Brightness</span>
						<input
							type="range"
							min={5}
							max={95}
							value={lightness}
							onChange={(e) => {
								const nextL = Number(e.target.value)
								setLightness(nextL)
								updateSlotHex(hslToHex(hsl.h, hsl.s, nextL))
							}}
						/>
					</label>
				</div>

				<div className="color-codes-col">
					<div className="color-preview-row">
						<input
							type="color"
							className="color-native-picker"
							value={currentHex}
							onChange={(e) => updateSlotHex(e.target.value)}
							title="Open system color picker / eyedropper"
						/>
						<div className="color-preview-meta">
							<strong>{currentHex.toUpperCase()}</strong>
							<span>{rgbString}</span>
						</div>
					</div>

					<label className="color-code-field">
						<span>HEX</span>
						<div className="color-code-input-row">
							<input
								className="ws-input ws-input-sm"
								value={hexDraft}
								onChange={(e) => {
									setHexDraft(e.target.value)
									const norm = normalizeHex(e.target.value)
									if (norm) updateSlotHex(norm)
								}}
								placeholder="#2563EB"
							/>
							<button
								type="button"
								className="ws-btn ws-btn-sm"
								onClick={() => void copyCode('HEX', currentHex.toUpperCase())}
							>
								{copied === 'HEX' ? '✓' : 'Copy'}
							</button>
						</div>
					</label>

					<div className="color-rgb-grid">
						{(['r', 'g', 'b'] as const).map((ch) => (
							<label key={ch} className="color-code-field">
								<span>{ch.toUpperCase()}</span>
								<input
									type="number"
									min={0}
									max={255}
									className="ws-input ws-input-sm"
									value={rgb[ch]}
									onChange={(e) => {
										const val = clampByte(Number(e.target.value) || 0)
										const next = { ...rgb, [ch]: val }
										updateSlotHex(rgbToHex(next.r, next.g, next.b))
									}}
								/>
							</label>
						))}
					</div>

					<div className="color-action-row">
						<button
							type="button"
							className="ws-btn ws-btn-sm"
							onClick={() => void copyCode('RGB', rgbString)}
						>
							{copied === 'RGB' ? 'Copied RGB' : 'Copy RGB'}
						</button>
						<button
							type="button"
							className={`ws-btn ws-btn-sm ${settings.defaultColor === activeColor ? 'ws-btn-primary' : ''}`}
							onClick={handleSetDefault}
						>
							{settings.defaultColor === activeColor ? '★ Default' : 'Set Default'}
						</button>
					</div>
				</div>
			</div>

			{/* Palette Presets */}
			<div className="color-presets-bar">
				<span className="color-presets-label">Presets:</span>
				{PALETTE_PRESETS.map((preset) => (
					<button
						key={preset.name}
						type="button"
						className="ws-chip-btn"
						onClick={() => handleApplyPreset(preset.overrides)}
					>
						{preset.name}
					</button>
				))}
				{settings.overrides[activeColor] && (
					<button type="button" className="ws-chip-btn" onClick={handleResetSlot}>
						Reset {activeColor}
					</button>
				)}
			</div>
		</div>
	)
}
