# Development

## Prerequisites

- Node.js 20+
- A Cloudflare account
- Wrangler access via `npx wrangler login`

## Project Layout

- `src/index.tsx`: Worker entrypoint, routes, and rendered page shell
- `public/`: browser assets
- `public/stats.js`: pure client-side stats and day-state helpers
- `public/ui.js`: browser interactions and DOM updates
- `schema.sql`: D1 schema
- `tests/`: Vitest unit, route, and DOM tests

## Common Commands

```bash
npm install
npm run db:init
npm run dev
npm run typecheck
npm test
npm run test:watch
npm run deploy
```

## Typical Development Flow

1. Install dependencies with `npm install`.
2. Initialize local D1 with `npm run db:init`.
3. Start the Worker locally with `npm run dev`.
4. Make changes.
5. Run `npm run typecheck` and `npm test`.

## Useful Notes

- The app expects a D1 binding named `DB` in `wrangler.toml`.
- In production, user identity is expected from the `cf-access-authenticated-user-email` header.
- Without Cloudflare Access, the app falls back to `dev_user@example.com`.
- Keep status values consistent across server and client: `office`, `wfh`, `holiday`, `exception`, `absent`, `public-holiday`.

## Testing

`npm test` runs three kinds of tests:

- Worker/helper tests for date logic and payload validation
- Route tests for Hono handlers with mocked D1
- DOM tests for browser interactions and optimistic updates in `public/ui.js`

When changing behavior, also verify the app manually in `wrangler dev`, especially calendar navigation and status persistence.
