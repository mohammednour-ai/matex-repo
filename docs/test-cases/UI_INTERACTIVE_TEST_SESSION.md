# UI Interactive Test Session

## Goal
Run browser-level interactive tests for `apps/web-v2` and report failures as developer-facing fix prompts instead of code changes.

## Source Of Truth
- Primary case catalog: `docs/test-cases/MATEX_TEST_CASES.md`
- Primary UI target: `apps/web-v2`
- Primary automation runner: `apps/web-v2/playwright.config.ts`

## Session Rules
- Stay at the user-visible UI level first.
- Prefer route-level and workflow-level assertions over implementation details.
- Do not fix product code during this session.
- Classify failures before reporting them: UI/visual regression, interaction defect, auth/session defect, or backend/data dependency.
- Every failed case must produce a developer prompt with route, reproduction, expected result, actual result, evidence, likely files to inspect, and a fix goal.
- If a case is blocked by missing infrastructure or seeded data, report it as blocked rather than failed.

## Case Family Mapping
| Case family | Primary routes | Session state | Runtime prerequisites | Recommended Playwright scope | Existing coverage |
|---|---|---|---|---|---|
| `TC-AUTH-*` | `/login`, `/dashboard` | Guest, then authenticated | Web UI, gateway, auth tooling; OTP-specific cases may need verified/unverified account handling | `functional/auth.spec.ts`, `smoke/health.spec.ts`, `uiux/design-review.spec.ts` | Partial |
| `TC-DASH-*` | `/dashboard` | Authenticated | Web UI, gateway, analytics/profile/notifications data | `smoke/health.spec.ts`, `uiux/design-review.spec.ts`, `regression/critical-paths.spec.ts` | Partial |
| `TC-LIST-*` | `/listings`, `/listings/create`, `/listings/[id]` | Authenticated | Listing, pricing, search, messaging, logistics, booking data depending on case | `functional/listings.spec.ts`, `regression/critical-paths.spec.ts` | Partial |
| `TC-SRCH-*` | `/search` | Authenticated | Searchable listing data and saved-search persistence for stateful cases | `functional/search.spec.ts`, `regression/critical-paths.spec.ts` | Partial |
| `TC-AUC-*` | `/auction`, `/auction/[id]` | Authenticated | Auction and bidding data; active room state for live cases | `functional/auction.spec.ts` | Partial |
| `TC-MSG-*` | `/messages`, `/listings/[id]` | Authenticated | Listing context, thread data, messaging service | `functional/messaging.spec.ts` | Partial |
| `TC-CHK-*` | `/checkout` | Authenticated | Order data, tax/payment responses, invoice generation | `functional/checkout.spec.ts`, `regression/critical-paths.spec.ts` | Partial |
| `TC-ESC-*` | `/escrow`, `/escrow/create` | Authenticated | Escrow data, payments state, dispute path for edge cases | `functional/escrow.spec.ts`, `regression/critical-paths.spec.ts` | Partial |
| `TC-LOG-*` | `/logistics` | Authenticated | Quote data, carrier responses, shipment state | `functional/logistics.spec.ts` | Partial |
| `TC-INS-*` | `/inspection` | Authenticated | Inspection and booking data | Sidebar/smoke coverage only | Limited |
| `TC-CON-*` | `/contracts` | Authenticated | Contract data, e-sign state, market widget data | Sidebar/smoke coverage only | Limited |
| `TC-SET-*` | `/settings` | Authenticated | Profile, company, KYC, notification settings data | `functional/settings.spec.ts`, `regression/critical-paths.spec.ts` | Partial |
| `TC-E2E-*` | Multi-route | Mixed | Full local stack, seeded entities, role-aware auth, optional admin or real-time infra | `smoke`, `regression`, targeted functional specs | Partial |

## Runtime Checklist
| Service | Default URL/port | Why it matters | Required for |
|---|---|---|---|
| Web UI | `http://localhost:3002` | Browser target for all cases | All UI cases |
| MCP Gateway | `http://localhost:3001` | Powers `/api/mcp`, auth, analytics, data-backed UI | Nearly all interactive cases |
| Local database/adapters | Local env-backed | Needed for realistic auth, listing, escrow, contracts, logistics, and settings flows | Most authenticated and data-dependent cases |
| Seed/test accounts | Env or API-created | Needed for login, role-switching, admin coverage, and persistence checks | Auth, dashboard, settings, admin, E2E |
| Optional real-time infra | Project-specific | Needed for notification live-update or multi-session cases | `TC-E2E-008`, `TC-E2E-015` |

## Recommended Execution Order
1. `smoke` for base platform availability.
2. `uiux` for visual shell and layout behavior.
3. Targeted `functional` specs for the case family under review.
4. `regression` for cross-route flows that should remain stable.
5. Specific end-to-end or edge-case reruns only after prerequisites are confirmed.

## Failure Classification Rules
- `UI/visual regression`: layout, responsiveness, visibility, styling, spacing, disabled states, wrong content placement.
- `Interaction defect`: buttons, forms, validation, navigation, modal/dialog, wizard-step behavior.
- `Auth/session defect`: login, logout, redirect guard, role gating, token persistence.
- `Backend/data dependency issue`: API unavailable, empty seeded data, gateway/tool failures, missing async state.
- `Blocked`: prerequisite service, role, or dataset is not available to test the case reliably.

## Developer Prompt Contract
Use this exact structure for every failed or blocked case:

```text
Fix the failing UI behavior on <route> in `apps/web-v2`.

Case:
<test case id and title>

Environment:
- UI: http://localhost:3002
- Gateway: http://localhost:3001
- Playwright scope: <project/spec>

Reproduction:
1. ...
2. ...
3. ...

Expected:
...

Actual:
...

Evidence:
- Visible UI symptom: ...
- Screenshot/trace/report reference: ...

Likely files to inspect:
- `apps/web-v2/src/app/...`
- `apps/web-v2/src/components/...`

Fix goal:
Restore the intended user-visible behavior without regressing adjacent flows.
```

## Blocker Reporting
If a case cannot be executed reliably, report:
- what dependency is missing
- whether the issue is environment-only or product-related
- the exact step where execution became blocked
- the minimal prerequisite needed before rerun
