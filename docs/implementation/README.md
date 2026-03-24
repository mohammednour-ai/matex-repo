# Matex Implementation Workspace

This folder operationalizes the 12-month plan into executable runbooks for a solo founder (15-20h/week).

## Structure

- `phases/phase-0-foundation.md`
- `phases/phase-1-core-mvp.md`
- `phases/phase-2-auctions-trust.md`
- `phases/phase-3-operations.md`
- `phases/phase-4-growth.md`
- `phases/phase-5-scale.md`
- `governance/monthly-gates.md`

## How To Use

1. Work one phase at a time.
2. Do not move phases until all exit criteria are complete.
3. Run monthly gate reviews in `governance/monthly-gates.md`.
4. Treat rule violations as release blockers:
   - missing RLS/policy coverage
   - missing audit trail on tools/events/bridge calls
   - invalid escrow/payment lifecycle transitions
   - unvalidated or weakly typed tool inputs

## Plan Inputs

Execution in this workspace is aligned to:

- `docs/milestones/Matex_Milestones_v1.docx`
- `docs/architecture/Matex_MCP_Architecture_v1.docx`
- `docs/database/matex_complete_schema.sql`
- `.cursor/rules/*.mdc`
