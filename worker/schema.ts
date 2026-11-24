import { createTLSchema, defaultShapeSchemas } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'

// Keep these props aligned with DocumentShapeUtil on the client.
export const schema = createTLSchema({
	shapes: {
		...defaultShapeSchemas,
		document: {
			props: { w: T.number, h: T.number, title: T.string, html: T.string, sourceFormat: T.string },
		},
	},
})
