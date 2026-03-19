# Drift Roadmap Log

## Cycle: 2026-03-19 08:00
- **Items added:**
  - [Quality] Fix path traversal vulnerability in write commands (P1, S)
  - [Quality] Fix diff algorithm producing incorrect write previews (P1, M)
  - [UX/UI] Add env file change notifications and auto-reload (P2, M)
- **Items archived:** none
- **Observations:** Initial roadmap seeding. Drift is functionally complete but the February 2026 audit found 5 critical bugs including a path traversal security vulnerability and incorrect diff previews. These must be resolved before the app can be trusted for its core purpose. The remaining 3 critical bugs (Vue reactivity, temp file collision) should be tracked in a future cycle.

## Cycle: 2026-03-19 15:00
- **Items added:**
  - [Quality] Fix Vue reactivity loss in env mutation composable (P1, S)
  - [Quality] Resolve temp file contention during concurrent write operations (P2, S)
- **Items archived:** none
- **Observations:** Added the two remaining critical bugs flagged in the initial seeding observations. Drift now has 5 pending items (3 P1, 1 P2, 1 P2) — all audit-driven. The P1 cluster (path traversal, diff algorithm, Vue reactivity) should be resolved as a batch before the P2 items. Both new items are small (S) and complement the existing quality fixes. No feature or innovation items added deliberately — trust in core operations must be established first.

## Cycle: 2026-03-19 22:00
- **Items added:**
  - [Feature] Add environment variable grouping by service prefix (P3, S)
- **Items archived:** none
- **Observations:** Added only 1 item this cycle — deliberately conservative given Drift has 5 pending quality fixes (3 P1, 2 P2) that must be resolved first. The service prefix grouping (P3) is a lightweight feature that improves the comparison matrix UX without interfering with the critical fix path. It can be implemented after the quality batch. Drift now has 6 pending items; no further additions recommended until the P1 cluster is cleared. Performance and Distribution categories remain absent — appropriate to defer until core trust is re-established.

## Cycle: 2026-03-19 22:30
- **Items added (Design System Adoption section):**
  - [Foundation] Integrate @stuntrocket/ui shared component library and design tokens (P1, M)
  - [UI Migration] Replace Spool components with @stuntrocket/ui shared components (P1, XL)
  - [Polish] Achieve full Scooda styleguide visual conformance (P2, L)
- **Items archived:** none
- **Observations:** Added Design System Adoption section. Drift's existing "Spool" design system has philosophical overlap with Scooda (glassmorphism, blur effects, ambient blobs) but diverges on specific values and is dark-only. The migration to Scooda adds light mode support and aligns all visual tokens. This is a significant investment but the existing quality P1s should be resolved first — design adoption can proceed once the core operations are trustworthy.
