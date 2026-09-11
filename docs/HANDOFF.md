# Implementation Handoff

Updated: 2026-09-11

## Current state

- The original assignment was reviewed.
- ChaChat product research was completed against its official site, documentation, and App Store listing.
- `docs/SPEC.md`, `docs/AI_WORKFLOW.md`, and `AGENTS.md` were written before application code.
- The spec stage was committed as `e71599b` (`spec: define funnel architecture and invariants`).
- A Next.js scaffold and frozen shared API schemas were added after that commit but are not committed yet.
- A Windows-hosted pnpm install against the WSL UNC path timed out. It created a partial `node_modules` directory but did not create `pnpm-lock.yaml`.
- No database, application feature, Docker, or test implementation has started.

## Environment note

Continue from a native WSL shell in `/home/zahar/project/chachat-funnel`. Do not install dependencies through a Windows UNC path. Ensure Linux-native Node.js 22 and pnpm 10.15.0 are available. Docker Desktop's Ubuntu WSL integration must be enabled before the final Compose verification.

## Immediate next steps

1. Read `AGENTS.md`, `docs/SPEC.md`, and `docs/AI_WORKFLOW.md` completely.
2. Inspect `git status` and the uncommitted scaffold.
3. Remove only the generated partial `node_modules` after verifying its resolved path is `/home/zahar/project/chachat-funnel/node_modules`.
4. Run `pnpm install` natively inside WSL and create `pnpm-lock.yaml`.
5. Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`; fix scaffold-only issues.
6. Commit the verified scaffold separately.
7. Start the parallel implementation wave with strict file ownership:
   - frontend/product;
   - backend/data/payments;
   - infrastructure/QA.
8. Keep package manifests, the lockfile, shared contracts, Git operations, and final integration under the primary agent.

## Continuation prompt

Use this prompt in the new Codex CLI session:

> Continue implementing the ChaChat full-stack test assignment as the primary integrator. Read `AGENTS.md`, `docs/SPEC.md`, `docs/AI_WORKFLOW.md`, and `docs/HANDOFF.md` completely before acting. Preserve commit `e71599b` as proof that the spec preceded code. The scaffold is currently uncommitted and the prior Windows-to-WSL pnpm install left a partial `node_modules` without a lockfile. Verify paths before removing only that generated directory, install with Linux-native Node.js/pnpm, validate and commit the scaffold, then use bounded subagents with the ownership rules in `docs/AI_WORKFLOW.md`. Continue through implementation, integration, tests, clean Docker Compose verification, and the final README. Do not stop at planning.

