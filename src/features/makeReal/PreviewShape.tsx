import { ReactElement } from 'react'
import {
	DefaultSpinner,
	HTMLContainer,
	Rectangle2d,
	RecordProps,
	ShapeUtil,
	SvgExportContext,
	T,
	TLShape,
	TldrawUiIcon,
	Vec,
	stopEventPropagation,
	toDomPrecision,
	useIsEditing,
	useToasts,
	useValue,
} from 'tldraw'

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		response: {
			html: string
			w: number
			h: number
		}
	}
}

export type PreviewShape = TLShape<'response'>

export class PreviewShapeUtil extends ShapeUtil<PreviewShape> {
	static override type = 'response' as const
	static override props: RecordProps<PreviewShape> = {
		html: T.string,
		w: T.number,
		h: T.number,
	}

	getDefaultProps(): PreviewShape['props'] {
		return {
			html: '',
			w: (960 * 2) / 3,
			h: (540 * 2) / 3,
		}
	}

	override canEdit = () => true
	override isAspectRatioLocked = () => false
	override canResize = () => true
	override canBind = () => false

	override getGeometry(shape: PreviewShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override component(shape: PreviewShape) {
		const isEditing = useIsEditing(shape.id)
		const toasts = useToasts()

		const boxShadow = useValue(
			'box shadow',
			() => {
				const rotation = this.editor.getShapePageTransform(shape)?.rotation() ?? 0
				return getRotatedBoxShadow(rotation)
			},
			[this.editor]
		)

		const htmlToUse = shape.props.html.replace(
			'</body>',
			`<script src="https://unpkg.com/html2canvas"></script><script>
			window.addEventListener('message', function (event) {
				if (event.source === window.parent && event.data && event.data.action === 'take-screenshot' && event.data.shapeid === "${shape.id}") {
					html2canvas(document.body, { useCors: true }).then(function (canvas) {
						window.parent.postMessage({ screenshot: canvas.toDataURL('image/png'), shapeid: "${shape.id}" }, '*')
					})
				}
			}, false)
			document.body.addEventListener('wheel', function (event) {
				if (!event.ctrlKey) return
				event.preventDefault()
			}, { passive: false })</script></body>`
		)

		return (
			<HTMLContainer className="tl-embed-container" id={shape.id}>
				{htmlToUse ? (
					<iframe
						id={`iframe-1-${shape.id}`}
						srcDoc={htmlToUse}
						width={toDomPrecision(shape.props.w)}
						height={toDomPrecision(shape.props.h)}
						draggable={false}
						sandbox="allow-scripts"
						referrerPolicy="no-referrer"
						style={{
							pointerEvents: isEditing ? 'auto' : 'none',
							boxShadow,
							border: '1px solid var(--color-panel-contrast)',
							borderRadius: 'var(--radius-2)',
						}}
					/>
				) : (
					<div
						style={{
							width: '100%',
							height: '100%',
							backgroundColor: 'var(--color-muted-2)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							border: '1px solid var(--color-muted-1)',
						}}
					>
						<DefaultSpinner />
					</div>
				)}
				<div
					style={{
						position: 'absolute',
						top: 0,
						right: -40,
						height: 40,
						width: 40,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						cursor: 'pointer',
						pointerEvents: 'all',
					}}
					onClick={async () => {
						try { await navigator.clipboard.writeText(shape.props.html); toasts.addToast({ title: 'Copied HTML' }) }
						catch { toasts.addToast({ title: 'Could not copy HTML', severity: 'error' }) }
					}}
					onPointerDown={stopEventPropagation}
				>
					<TldrawUiIcon icon="duplicate" label="Copy HTML" />
				</div>
				{shape.props.html && <button type="button" aria-label="Download prototype HTML" title="Download HTML" onPointerDown={stopEventPropagation}
					style={{ position: 'absolute', top: 44, right: -80, pointerEvents: 'all', padding: 6 }}
					onClick={() => {
						const url = URL.createObjectURL(new Blob([shape.props.html], { type: 'text/html' }))
						const link = document.createElement('a'); link.href = url; link.download = 'jastldraw-prototype.html'; link.click()
						setTimeout(() => URL.revokeObjectURL(url), 1000)
					}}>HTML ↓</button>}

				{htmlToUse && (
					<div
						style={{
							textAlign: 'center',
							position: 'absolute',
							bottom: isEditing ? -40 : 0,
							padding: 4,
							fontFamily: 'inherit',
							fontSize: 12,
							left: 0,
							width: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							pointerEvents: 'none',
						}}
					>
						<span
							style={{
								background: 'var(--color-panel)',
								padding: '4px 12px',
								borderRadius: 99,
								border: '1px solid var(--color-muted-1)',
							}}
						>
							{isEditing ? 'Click the canvas to exit' : 'Double click to interact'}
						</span>
					</div>
				)}
			</HTMLContainer>
		)
	}

	override toSvg(shape: PreviewShape, _ctx: SvgExportContext): Promise<ReactElement> {
		return new Promise<ReactElement>((resolve, reject) => {
			if (typeof window === 'undefined') {
				reject(new Error('Prototype screenshot unavailable. Download its HTML instead.'))
				return
			}

			const windowListener = (event: MessageEvent) => {
				if (event.source === firstLevelIframe?.contentWindow && event.data?.screenshot && event.data?.shapeid === shape.id) {
					window.removeEventListener('message', windowListener)
					clearTimeout(timeOut)
					resolve(<PreviewImage href={event.data.screenshot} shape={shape} />)
				}
			}
			const timeOut = setTimeout(() => {
				reject(new Error('Prototype screenshot unavailable. Download its HTML instead.'))
				window.removeEventListener('message', windowListener)
			}, 10000)
			window.addEventListener('message', windowListener)

			const firstLevelIframe = document.getElementById(
				`iframe-1-${shape.id}`
			) as HTMLIFrameElement | null
			if (!firstLevelIframe) {
				clearTimeout(timeOut)
				window.removeEventListener('message', windowListener)
				reject(new Error('Prototype screenshot unavailable. Download its HTML instead.'))
				return
			}
			firstLevelIframe.contentWindow?.postMessage(
				{ action: 'take-screenshot', shapeid: shape.id },
				'*'
			)
		})
	}

	override getIndicatorPath(shape: PreviewShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function PreviewImage({ shape, href }: { shape: PreviewShape; href: string }) {
	return <image href={href} width={shape.props.w.toString()} height={shape.props.h.toString()} />
}

function getRotatedBoxShadow(rotation: number) {
	return ROTATING_BOX_SHADOWS.map((shadow) => {
		const { offsetX, offsetY, blur, spread, color } = shadow
		const vector = new Vec(offsetX, offsetY).rot(-rotation)
		return `${vector.x}px ${vector.y}px ${blur}px ${spread}px ${color}`
	}).join(', ')
}

const ROTATING_BOX_SHADOWS = [
	{ offsetX: 0, offsetY: 2, blur: 4, spread: -1, color: '#0000003a' },
	{ offsetX: 0, offsetY: 3, blur: 12, spread: -2, color: '#0000001f' },
]
