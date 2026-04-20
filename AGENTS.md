# Matex — Agent Implementation Rules

These rules apply to any AI coding agent working in this repo. They encode patterns we have learned the hard way and are enforced during code review. Read this first; ask before deviating.

## Asset safety

- Never overwrite a binary asset (PNG, JPG, MP4, etc.) in place without first checking `git status` for tracking. If the file is untracked, copy it to a sibling `*.bak` before mutating.
- For batch image scripts, always run a `--dry-run` on 2–3 representative files before the full pass.
- Prefer scripts under `scripts/` over ad-hoc shell commands so the operation is reproducible and reviewable.
- Never rename or move a file under `apps/web-v2/public/` without updating every reference and re-running the linter.

## Image slot contract

- Every `<Image>` from `next/image` must declare either `fill` (with a sized parent) **or** both `width` and `height`.
- When using `fill`, always pass a `sizes` prop that matches the rendered slot (helps Next pick the right responsive variant).
- Use `priority` only on above-the-fold hero images, never on lazy/below-the-fold imagery.
- Decorative imagery: `alt=""` and `aria-hidden`. Meaningful imagery: a real, descriptive `alt`.
- Match the asset's intrinsic aspect ratio to the rendered slot. If they differ, choose `object-contain` (no crop) or regenerate the asset. Do not silently `object-cover` important content out of frame.

## MCP client contract

The single source of truth for the MCP envelope is [`apps/web-v2/src/app/api/mcp/route.ts`](apps/web-v2/src/app/api/mcp/route.ts).

- Request body is `{ tool, args, token? }`. **Never** `input`. **Never** `params`.
- Never put the bearer in an `Authorization` header from the browser; always pass `token` in the JSON body so `/api/mcp/route.ts` can control upstream auth.
- Use `callTool(tool, args, { token })` from [`apps/web-v2/src/lib/api.ts`](apps/web-v2/src/lib/api.ts) — do not hand-roll `fetch("/api/mcp")` calls in pages or components.
- Response shape is `{ success, data, error? }`. Some auth tools nest the upstream payload at `data.upstream_response.data`; `callTool` unwraps that for you.
- Always check `res.success` before consuming `res.data`. Never write `if (res.success || true)` or similar truthy escapes.

## Data flow and state

- No mock arrays in shipped pages. Every page that renders backend data uses a `loading | error | empty | data` state machine.
- The `empty` branch must use the `EmptyState` component with the matching illustration from `apps/web-v2/public/illustrations/`.
- Never silently `catch {}`. Surface errors via the page's existing error UI, a toast, or a logged warning — but never nothing.
- Don't hardcode prices, IDs, or copy that should come from MCP. If an endpoint isn't ready, gate the UI behind an explicit `Coming soon` empty state, not fake data.

## Routing and access control

- Pages that depend on `isPlatformAdmin` must guard at the route level (not just in the nav). On guard failure, `router.replace("/dashboard")`.
- Every `<Link href>` and `router.push` target must resolve to an existing route. Run a quick repo-wide grep before adding new internal links.
- Auth gating in `(app)` lives in [`apps/web-v2/src/app/(app)/layout.tsx`](apps/web-v2/src/app/(app)/layout.tsx). The first paint must be gated behind a `ready` flag — do not render authed UI before client-side validation completes.

## Editing discipline

- Read the file before editing it; spot-check the rendered result after.
- Run `pnpm --filter @matex/web-v2 lint` after substantive edits.
- Don't introduce comments that narrate what the code does; comments should explain non-obvious intent or constraints only.
- When fixing a bug in a page, also remove or fix any other instances of the same anti-pattern in the same file.

## Where to put new things

- Reusable presentation primitives → `apps/web-v2/src/components/ui/`.
- Layout/shell pieces → `apps/web-v2/src/components/layout/`.
- API/data wrappers → `apps/web-v2/src/lib/`.
- Reusable hooks → `apps/web-v2/src/lib/hooks/`.
- Public static assets → `apps/web-v2/public/` only. Do not stash images at the repo root.

## Documentation

- Image generation prompts and intended slots live in [`docs/design/IMAGE_GENERATION_PROMPTS.md`](docs/design/IMAGE_GENERATION_PROMPTS.md). Keep that file in sync when adding or replacing assets.
- Functional test cases live in [`docs/test-cases/MATEX_TEST_CASES.md`](docs/test-cases/MATEX_TEST_CASES.md). When fixing a bug surfaced by a test, link the test ID in the commit message.
