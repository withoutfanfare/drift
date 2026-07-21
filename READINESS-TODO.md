# Drift — Public-Readiness TODO

> Companion to [`../Tauri Apps - Public Readiness Plan.md`](../Tauri%20Apps%20-%20Public%20Readiness%20Plan.md).
> Every item below is transcribed from that report — see **Source coverage** at the bottom to confirm nothing was dropped.

| | |
|---|---|
| Path (git root) | `drift/` |
| Remote | `withoutfanfare/drift` |
| Visibility | **PUBLIC** |
| Bundle ID | `com.dannyharding.drift` |
| Overall risk (report §10) | **Low** — cleanest public app |
| CSP | good (`default-src 'self'; img-src 'self' asset:`) |

## How to use
`- [ ]` open · `- [x]` done · `- [~]` blocked / decision needed (note why). Phases mirror report §9. **P0 → P1 are gating.**

## §4 "Safely public" scorecard (transcribed from report §10)

| # | Criterion | Status | Note |
|---|---|---|---|
| 1 | No secrets / PII in git history | ✅ | clean; explicit secret-masking feature (§7) |
| 2 | No secrets / PII in working tree | ✅ | (§7) |
| 3 | LICENSE present | ❌ | none (§6.1) |
| 4 | Builds from clean clone | ❌ | (§6.2 portfolio-wide) |
| 5 | CSP not null | ✅ | good (§7) |
| 6 | Least-privilege capabilities | ✅ | minimal (§7) |
| 7 | No dangerous code paths | ✅ | `Command::new("git")` discrete args (§7) |
| 8 | No undisclosed telemetry | ✅ | no telemetry; model privacy statement (§7) |
| 9 | No confidential client data | ✅ | (§10) |
| 10 | README adequate | ✅ | (§10) |
| 11 | Secret-scanning in CI | ❌ | none (§6.7) |

## P0 — Incident response
_None for Drift_ (cleanest public app).

## P1 — Blockers before publicising (gating)
- [ ] **Add LICENSE** to repo root — decision §8.1 (default MIT). Set `license`/`author` in `package.json`. (report §6.1, §9 P1.1)
- [ ] **Solve `@stuntrocket/ui` distribution** — pending §8.2 (default publish to npm). (report §6.2, §9 P1.2)

## P2 — Security hardening
- [ ] **Secret-scanning CI** — `gitleaks` pre-commit + GitHub Actions (report Appendix C). (report §6.7, §9 P2.4)
- [ ] **Standardise `.gitignore`** to report Appendix D. (report §6.7, §9 P2.6)
- [ ] **Wire `npm audit` / `cargo audit` into CI** (currently 0 high). (report §9 P2.7)

## P3 — Polish & privacy presentation
- [ ] **Bundle-ID decision** — `com.dannyharding.drift` → unified scheme (default `co.stuntrocket.drift`). ⚠️ decide **before** notarisation. (report §6.5, §8.3, §9 P3.1)
- [ ] **Use Drift's privacy statement as the portfolio template** (already good) and keep it in the README. (report §7 drift, §9 P3.5)
- [ ] **Add `SECURITY.md`** (report Appendix G). (report §9 P3.6)

## Source coverage
Maps **every Drift mention in the main report** to a row above (all copied ✅).

| Report ref | What it says about Drift | Landed in | Copied |
|---|---|---|---|
| §2 table | path / remote / bundle id | header | ✅ |
| §6.1 | no LICENSE | P1 | ✅ |
| §6.2 | clean-clone blocker (portfolio-wide) | P1 | ✅ |
| §6.5 | bundle id `com.dannyharding.drift` | P3 | ✅ |
| §6.7 | no secret-scanning CI | P2 | ✅ |
| §7 Drift | history clean; secret-masking feature; no emails/paths in code; minimal capabilities; fully-local + no telemetry; model privacy statement; discrete git args; npm audit 0; cleanest public app | scorecard + P3 | ✅ |
| §8.1/§8.2/§8.3 | licence / UI / bundle-id decisions | P1/P3 | ✅ |
| §9 P2.4/P2.6/P2.7 | gitleaks, gitignore, audit CI | P2 | ✅ |
| §9 P3.1/P3.5/P3.6 | bundle id, privacy (Drift = template), SECURITY.md | P3 | ✅ |
| §10 row | full scorecard | scorecard | ✅ |
