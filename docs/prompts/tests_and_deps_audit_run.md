Read CLAUDE.md, docs/audit/testauditinstruct.md and docs/audit/dependency-updates.md (all of each). Audit this repo's tests against testauditinstruct.md, using its rule IDs as the checklist.

This is read-only. Don't change code, config or tests. The only files you may write are the report and the guide corrections in step 6.

1. Map the current state. List every workspace and its test setup: Vitest configs and projects, Playwright configs, test folders and naming, shared helpers, the task runner and how CI invokes tests. Read the CI workflow files and biome.json.

2. Check every rule. Mark each rule ID PASS, FAIL, PARTIAL or N/A, with file:line evidence for each violation. Use grep for the mechanical rules (waitForTimeout, waitForSelector, force: true, .only, page.pause, $eval, serial mode, CSS/XPath selectors, unawaited Playwright calls, if/switch in test bodies, module-level let reassigned in hooks, setTimeout sleeps, snapshot files). Read the code for the judgement rules (layer choice, fixtures, data isolation, mock boundaries, mock typing). Don't mark a rule PASS without checking it.

3. Protected tests (§3). Confirm each one exists and what it asserts. Propose other tests that should be protected, with reasons.

4. Upgrade-critical coverage (§4). For each row, report what tests exist today, what they actually assert, and what's missing against the "Coverage needed" column. Run coverage for those paths only (vitest --coverage scoped to them) and report line and branch figures. Say plainly whether each dependency step (4, 5, 6, 7, 8, 9) is safe to start, and if not, which tests should be written first.

5. Stability baseline. Run the unit and integration suites with `--sequence.shuffle` twice and the website E2E with `--repeat-each=3 --workers=4`. Record durations and any failures, and classify each failure as flaky, order-dependent or genuinely broken. Run admin E2E only if the full stack is already running as CLAUDE.md describes. Otherwise say it was skipped. Never call real AI providers, never run ai:smoke, and don't start Redis or external services.

6. Correct the guide. Where the guide's guesses don't match the repo (e2e paths in §8, the journeys in §7, layer locations in §2), edit testauditinstruct.md to match reality, and list each edit in the report. Don't change any rule's intent.

Write the report to docs/audit/test-audit-report.md, in Australian spelling, containing:
- Summary: score (rules passed / applicable), the top 5 risks ranked by how much they weaken the upgrade gate.
- Table: Rule ID | Status | Violations | Notes.
- Violations grouped by rule ID, each with file:line and a one-line suggested fix.
- Upgrade readiness: one row per dependency step from §4, marked ready, ready with gaps or blocked, with the tests to write first.
- Stability baseline: durations, and flaky or order-dependent tests, ready to paste into dependency step 0.
- Remediation plan in three tiers: before upgrades (lint, config, quarantining flaky tests, protected-test and upgrade-critical gaps), during upgrades (nothing structural), after upgrades (structural refactors, moving coverage down the pyramid). Estimate effort per item.