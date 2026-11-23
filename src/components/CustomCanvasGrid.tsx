import type { TLGridProps } from 'tldraw'

export type CanvasGridStyle = 'dots' | 'lines' | 'none'

export function createCanvasGridComponent(style: CanvasGridStyle, isDark: boolean) {
	return function CustomCanvasGrid({ x, y, z, size }: TLGridProps) {
		if (style === 'none') return null

		const step = Math.max(12, size * 2.5 * z)
		const offsetX = ((x * z) % step + step) % step
		const offsetY = ((y * z) % step + step) % step

		if (style === 'dots') {
			const dotColor = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(15, 23, 42, 0.22)'
			const radius = Math.max(1, Math.min(2.2, 1.35 * Math.sqrt(z)))
			return (
				<svg
					className="tl-grid"
					aria-hidden="true"
					style={{
						position: 'absolute',
						inset: 0,
						width: '100%',
						height: '100%',
						pointerEvents: 'none',
					}}
				>
					<defs>
						<pattern
							id="jastldraw-dot-grid"
							width={step}
							height={step}
							patternUnits="userSpaceOnUse"
							x={offsetX}
							y={offsetY}
						>
							<circle cx={radius} cy={radius} r={radius} fill={dotColor} />
						</pattern>
					</defs>
					<rect width="100%" height="100%" fill="url(#jastldraw-dot-grid)" />
				</svg>
			)
		}

		// Graph / blueprint lines
		const lineColor = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(15, 23, 42, 0.09)'
		return (
			<svg
				className="tl-grid"
				aria-hidden="true"
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					pointerEvents: 'none',
				}}
			>
				<defs>
					<pattern
						id="jastldraw-line-grid"
						width={step}
						height={step}
						patternUnits="userSpaceOnUse"
						x={offsetX}
						y={offsetY}
					>
						<path
							d={`M ${step} 0 L 0 0 0 ${step}`}
							fill="none"
							stroke={lineColor}
							strokeWidth="1"
						/>
					</pattern>
				</defs>
				<rect width="100%" height="100%" fill="url(#jastldraw-line-grid)" />
			</svg>
		)
	}
}
