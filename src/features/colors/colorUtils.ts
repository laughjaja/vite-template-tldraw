import {
	DEFAULT_THEME,
	DefaultColorStyle,
	type Editor,
	type TLDefaultColor,
	type TLDefaultColorStyle,
	type TLTheme,
} from 'tldraw'

export const ALL_COLOR_SLOTS: TLDefaultColorStyle[] = [
	'black',
	'grey',
	'blue',
	'light-blue',
	'violet',
	'light-violet',
	'green',
	'light-green',
	'yellow',
	'orange',
	'red',
	'light-red',
	'white',
]

export interface UserColorSettings {
	defaultColor: TLDefaultColorStyle
	overrides: Partial<Record<TLDefaultColorStyle, string>>
}

const STORAGE_KEY = 'jastldraw-color-settings-v1'

export const PALETTE_PRESETS: Array<{
	name: string
	overrides: Partial<Record<TLDefaultColorStyle, string>>
}> = [
	{ name: 'tldraw Classic', overrides: {} },
	{
		name: 'Pastel Soft',
		overrides: {
			blue: '#60a5fa',
			'light-blue': '#93c5fd',
			violet: '#a78bfa',
			'light-violet': '#ddd6fe',
			green: '#34d399',
			'light-green': '#86efac',
			yellow: '#fde047',
			orange: '#fdba74',
			red: '#fb7185',
			'light-red': '#fda4af',
		},
	},
	{
		name: 'Vibrant Studio',
		overrides: {
			blue: '#2563eb',
			'light-blue': '#06b6d4',
			violet: '#7c3aed',
			'light-violet': '#d946ef',
			green: '#16a34a',
			'light-green': '#84cc16',
			yellow: '#eab308',
			orange: '#f97316',
			red: '#dc2626',
			'light-red': '#f43f5e',
		},
	},
	{
		name: 'Earth & Ink',
		overrides: {
			black: '#1c1917',
			grey: '#78716c',
			blue: '#0f766e',
			'light-blue': '#5eead4',
			green: '#4d7c0f',
			'light-green': '#a3e635',
			yellow: '#ca8a04',
			orange: '#c2410c',
			red: '#991b1b',
			violet: '#6d28d9',
		},
	},
]

export function clampByte(n: number): number {
	return Math.max(0, Math.min(255, Math.round(n)))
}

export function normalizeHex(input: string): string | null {
	const cleaned = input.trim().replace(/^#/, '')
	if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
		const expanded = cleaned
			.split('')
			.map((c) => c + c)
			.join('')
		return `#${expanded.toLowerCase()}`
	}
	if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
		return `#${cleaned.toLowerCase()}`
	}
	return null
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
	const norm = normalizeHex(hex) ?? '#1d1d1d'
	const n = parseInt(norm.slice(1), 16)
	return {
		r: (n >> 16) & 255,
		g: (n >> 8) & 255,
		b: n & 255,
	}
}

export function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (v: number) => clampByte(v).toString(16).padStart(2, '0')
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	const rn = r / 255
	const gn = g / 255
	const bn = b / 255
	const max = Math.max(rn, gn, bn)
	const min = Math.min(rn, gn, bn)
	const l = (max + min) / 2
	let h = 0
	let s = 0
	if (max !== min) {
		const d = max - min
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
		switch (max) {
			case rn:
				h = (gn - bn) / d + (gn < bn ? 6 : 0)
				break
			case gn:
				h = (bn - rn) / d + 2
				break
			default:
				h = (rn - gn) / d + 4
				break
		}
		h *= 60
	}
	return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex(h: number, s: number, l: number): string {
	const hn = ((h % 360) + 360) % 360
	const sn = Math.max(0, Math.min(100, s)) / 100
	const ln = Math.max(0, Math.min(100, l)) / 100
	const c = (1 - Math.abs(2 * ln - 1)) * sn
	const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
	const m = ln - c / 2
	let r = 0
	let g = 0
	let b = 0
	if (hn < 60) [r, g, b] = [c, x, 0]
	else if (hn < 120) [r, g, b] = [x, c, 0]
	else if (hn < 180) [r, g, b] = [0, c, x]
	else if (hn < 240) [r, g, b] = [0, x, c]
	else if (hn < 300) [r, g, b] = [x, 0, c]
	else [r, g, b] = [c, 0, x]
	return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

function mixHex(hexA: string, hexB: string, ratioB: number): string {
	const a = hexToRgb(hexA)
	const b = hexToRgb(hexB)
	const t = Math.max(0, Math.min(1, ratioB))
	return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
}

function buildColorVariants(baseHex: string, isDark: boolean): TLDefaultColor {
	const bgMix = isDark ? '#18181b' : '#ffffff'
	const semi = mixHex(baseHex, bgMix, isDark ? 0.72 : 0.82)
	const pattern = mixHex(baseHex, bgMix, 0.25)
	const linedFill = mixHex(baseHex, bgMix, 0.35)
	const frameFill = mixHex(baseHex, bgMix, isDark ? 0.84 : 0.92)
	const noteFill = mixHex(baseHex, bgMix, isDark ? 0.55 : 0.65)
	const { r, g, b } = hexToRgb(baseHex)
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
	const noteText = isDark ? '#f8fafc' : luminance < 0.35 ? '#ffffff' : '#111827'

	return {
		solid: baseHex,
		semi,
		pattern,
		fill: baseHex,
		linedFill,
		frameHeadingStroke: baseHex,
		frameHeadingFill: semi,
		frameStroke: baseHex,
		frameFill,
		frameText: isDark ? '#f8fafc' : '#111827',
		noteFill,
		noteText,
		highlightSrgb: mixHex(baseHex, '#ffffff', 0.35),
		highlightP3: mixHex(baseHex, '#ffffff', 0.35),
	}
}

export function loadUserColorSettings(): UserColorSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return { defaultColor: 'black', overrides: {} }
		const parsed = JSON.parse(raw) as Partial<UserColorSettings>
		const defaultColor =
			parsed.defaultColor && ALL_COLOR_SLOTS.includes(parsed.defaultColor)
				? parsed.defaultColor
				: 'black'
		return {
			defaultColor,
			overrides: parsed.overrides ?? {},
		}
	} catch {
		return { defaultColor: 'black', overrides: {} }
	}
}

export function saveUserColorSettings(settings: UserColorSettings) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
	} catch {
		// Ignore quota errors
	}
}

export function getSlotDisplayHex(
	slot: TLDefaultColorStyle,
	overrides: Partial<Record<TLDefaultColorStyle, string>>,
	isDark = false
): string {
	const custom = overrides[slot]
	if (custom) return custom
	const palette = isDark ? DEFAULT_THEME.colors.dark : DEFAULT_THEME.colors.light
	const entry = palette[slot] as TLDefaultColor | undefined
	return entry?.solid ?? '#1d1d1d'
}

export function applyColorSettingsToEditor(
	editor: Editor,
	settings: UserColorSettings,
	applyDefaultStyle = false
) {
	const nextLight = { ...DEFAULT_THEME.colors.light }
	const nextDark = { ...DEFAULT_THEME.colors.dark }

	for (const slot of ALL_COLOR_SLOTS) {
		const hex = settings.overrides[slot]
		if (hex) {
			nextLight[slot] = buildColorVariants(hex, false)
			nextDark[slot] = buildColorVariants(hex, true)
		}
	}

	const nextTheme: TLTheme = {
		...DEFAULT_THEME,
		colors: {
			light: nextLight,
			dark: nextDark,
		},
	}

	editor.updateTheme(nextTheme)

	if (applyDefaultStyle) {
		editor.setStyleForNextShapes(DefaultColorStyle, settings.defaultColor)
	}
}
