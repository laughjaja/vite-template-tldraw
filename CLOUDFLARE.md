# Cloudflare migration

This migration keeps the existing application and repository. It moves hosting, shared canvas state, and uploaded assets to Cloudflare using tldraw's official sync architecture. Gemini and other model-provider work are parked. External ChatGPT/Claude collaboration is a separate integration and is not implemented by this migration.

## Deployment prerequisites

- A signed-in Cloudflare account with Workers, Durable Objects, and R2 access.
- A tldraw hobby license covering the final deployed hostname. The original license covers `jastldraw.vercel.app` only; do not assume it covers a new `workers.dev` hostname.
- A workspace password stored as a Cloudflare Worker secret, not in source control.

The frontend uses a shared room instead of a browser-only document. The Worker protects session, WebSocket, and asset access. Uploaded assets use R2. Board state uses the Durable Object's SQLite storage.

## Preserve existing data

Browser storage belongs to its original hostname. A new Cloudflare URL cannot read documents stored under the Vercel URL.

1. Open the existing Vercel app in each browser containing a board you need.
2. Save the workspace through **File / Export → Save Snapshot**. Keep those files as backups.
3. After the Cloudflare app passes verification, sign in and import a snapshot into the shared board.
4. Verify documents, images, PDFs, and comments before considering cutover complete. Legacy comments and preferences may require the migration controls documented in the UI; never assume browser-local data moved automatically.

Do not delete or disable the existing Vercel deployment until cloud persistence and import have been verified.

## Release acceptance

- Unauthorized requests cannot read or change boards or uploaded files.
- Two independently connected clients see the same shape changes.
- A fresh connection and a restarted local server recover saved board content.
- Custom document shapes survive synchronization.
- Uploaded files remain readable after reconnecting.
- The licensed canvas stays visible for more than five seconds on the deployed hostname.
- Existing studios and JSON backup/import remain available.

## Official sources

- [tldraw sync](https://tldraw.dev/docs/sync)
- [Official Cloudflare template](https://github.com/tldraw/tldraw/tree/v5.6.2/templates/sync-cloudflare)
- [Custom shape synchronization](https://tldraw.dev/starter-kits/multiplayer#custom-shapes-integration)
- [License domains](https://tldraw.dev/sdk-features/license-key)

## Rollback

The existing Vercel deployment and its browser-local data remain available. Until shared-board cutover is verified, migration code stays on a separate branch. If the new release fails, continue using the original Vercel deployment and keep the exported snapshots. Changes made on the cloud board after cutover must be exported separately before switching back.

## Release target and local verification

The configured Worker is `jastldraw` on `jastldraw.jastudio.ca`. The temporary evaluation license currently used for the build expires on December 8, 2026. Replace it with a valid ongoing license for this hostname before that date. License values remain in ignored local build configuration.

Set `WORKSPACE_PASSWORD` with Wrangler's secret command. Never commit it. The application fails closed until this secret exists. Session cookies last 24 hours. Changing the password invalidates existing cookies on subsequent requests. The public login endpoint allows 10 attempts per minute per Cloudflare client IP.

Local checks completed: production build, Worker TypeScript, Wrangler dry run, session/authentication edge cases, protected R2 reads and writes, WebSocket handshake, two independent sync clients, concurrent custom document creation, shared comments, fresh-client reload, and full Worker restart recovery from SQLite. Browser checks on the licensed final hostname remain required before cutover.

The local test fixture password is intentionally nonsecret. Never use that fixture password in production. Run `node worker/test-auth.mjs` for isolated auth checks, `node worker/test-backend.mjs http://127.0.0.1:8791` against an isolated fixture Worker, and `npm run test:cloud-sync` for the local-only sync integration. After restarting the Worker with the same storage, run `node scripts/test-cloud-sync.mjs --verify-restart`.
