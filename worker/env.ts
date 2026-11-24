export interface Env {
	ASSETS: Fetcher
	TLDRAW_BUCKET: R2Bucket
	TLDRAW_DURABLE_OBJECT: DurableObjectNamespace
	AUTH_RATE_LIMITER: DurableObjectNamespace
	WORKSPACE_PASSWORD?: string
}
