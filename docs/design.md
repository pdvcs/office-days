# Design

## Goal

Office Days is a simple attendance tracker for individuals who need to see, update, and review office presence over a rolling 28-day period.

## Core Design Choices

### Cloudflare-first deployment

The app runs on Cloudflare Workers with Hono and stores user data in D1. This keeps hosting simple, avoids a separate server, and fits a small personal tool well.

### Server-rendered shell, simple client behavior

The page is rendered on the Worker and enhanced with small browser-side scripts. This avoids a full SPA framework while still supporting rich interactions such as bulk date selection, optimistic updates, and keyboard shortcuts.

### Email-scoped user data

Records are keyed by authenticated email. In production, the intended setup is Cloudflare Access in front of the Worker so each signed-in user gets isolated data without building a separate auth system.

### Fixed 28-day periods

The calendar is not month-based. It uses fixed 28-day windows anchored to a base date. That matches the attendance policy this tool was built around and makes office-target calculations predictable.

### Testable logic boundaries

Shared date logic, payload validation, and route behavior live in testable Worker helpers. Client-side stats logic is separated from DOM updates so behavior can be verified without depending on manual browser testing alone.

## Tradeoffs

- The inline HTML in `src/index.tsx` keeps the app small, but view complexity is concentrated in one file.
- Client behavior is intentionally minimal and imperative; this keeps dependencies low but requires discipline as interactions grow.
- D1 is a good fit for simple per-user state, but it is not intended here for analytics-heavy queries or complex reporting.
