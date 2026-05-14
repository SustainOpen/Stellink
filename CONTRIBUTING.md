# Contributing to Stellink

Thanks for considering a contribution. Stellink is a small, focused codebase — the goal is to keep it that way.

## Onboarding: how to make your first contribution

Stellink uses a **claim → assign → code → review** flow. PRs that skip the claim step are closed without review. The flow protects both contributors (no two people work on the same thing) and the project (no surprise drive-by patches).

### 1. Pick an issue

Browse the [issue tracker](https://github.com/SustainOpen/Stellink/issues) and look for one labelled [`good first issue`](https://github.com/SustainOpen/Stellink/labels/good%20first%20issue) or [`help wanted`](https://github.com/SustainOpen/Stellink/labels/help%20wanted). Read it end-to-end — every issue lists the files to touch and explicit acceptance criteria.

### 2. Ask to be assigned

Comment on the issue saying you want to take it. Something like *"I'd like to work on this, please assign me."* is enough. A maintainer assigns within ~24 hours.

**Do not start coding before you're assigned.** Assignment is what reserves the work — it's how we prevent three near-identical PRs racing to merge against the same issue. PRs from contributors who weren't assigned will be closed with a polite note redirecting them to the queue.

If an issue is already assigned but the assignee hasn't pushed anything in 7 days, comment asking if they're still active. Maintainers unassign stale claims so the next contributor can pick them up.

### 3. Code on a feature branch

```bash
# Fork the repo, then on your fork:
git checkout -b feat/<short-slug>
# ... make changes ...
npm run lint
npm run build
git commit -m "feat(escrow): handle USDC trustline auto-creation"
git push -u origin feat/<short-slug>
```

Use **Conventional Commits** for the title: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

**Do not push to `main`** on your fork. Always work on a feature branch.

### 4. Open the PR and run the AI review

When you open a PR, our GitHub Action posts a short comment with the AI review command. To pass review, you need to:

1. Trigger the AI reviewer by commenting `@greptile review` (or whichever bot is configured — the welcome comment tells you exactly which).
2. Wait 5–10 minutes for the review to come back.
3. Address every comment until the reviewer reports **Confidence Score: 5/5** with **zero unresolved threads**.
4. Re-trigger after each round of changes by commenting `@greptile review` again.

Only PRs at 5/5 are queued for human maintainer review. This isn't bureaucracy — it catches 80% of the easy review feedback before a human spends time on it, so your PR gets merged faster.

### 5. Maintainer review

Once the AI reviewer is happy and CI is green (build + lint + tests pass), a maintainer does a final read. We aim to respond within 7 days. Maintainers either approve and merge, request specific changes, or — rarely — close with a rationale.

Your first merged PR earns you faster review on subsequent PRs.

## Ground rules

- **One concern per PR.** If a refactor uncovers a bug, open a separate PR for the fix.
- **Match the existing code style.** TypeScript strict, no `any` unless commented, ESLint passes, Tailwind utility classes only, no emojis in source unless asked.
- **Tests for contract changes.** Anything inside `contracts/` ships with `cargo test` coverage. Frontend tests use Vitest (when the harness lands — see [issue #4](https://github.com/SustainOpen/Stellink/issues/4)).
- **Screenshots for visible changes.** Any change that touches the UI needs a before/after screenshot or a short Loom in the PR description.
- **Build must be green.** PRs with red CI checks won't be reviewed until they're green.

## What gets a PR closed without merge

- Submitted without being assigned to the issue.
- Doesn't follow the PR template.
- Reads as AI-generated boilerplate with no real engagement (we can tell — please don't waste your time or ours).
- Closes an issue the author wasn't working on.
- Includes secrets, unrelated dependencies, or sweeping reformat changes.
- Build is red and the author isn't responding to the AI reviewer.

## Local setup checklist

| Step                       | Command                                 |
|----------------------------|-----------------------------------------|
| Install deps               | `npm install`                           |
| Start PocketBase           | `npm run pb:setup` *or* `npm run pb:up` |
| Start dev server           | `npm run dev`                           |
| Build frontend             | `npm run build`                         |
| Lint                       | `npm run lint`                          |
| Build Soroban contract     | `npm run contracts:build`               |
| Test Soroban contract      | `npm run contracts:test`                |

## Architecture cheatsheet

| Layer                | Where                                                                          |
|----------------------|--------------------------------------------------------------------------------|
| Stellar tx builders  | `frontend/src/lib/stellar.ts`                                                  |
| Network config       | `frontend/src/lib/configAddress.ts`                                            |
| Wallet integration   | `frontend/src/hooks/useStellarWallet.ts` + `frontend/src/lib/walletContext.tsx`|
| PocketBase client    | `frontend/src/lib/pocketbase.ts`                                               |
| Data access layer    | `frontend/src/lib/linkStore.ts`                                                |
| PocketBase schema    | `scripts/pocketbase-schema.json`                                               |
| Soroban contract     | `contracts/stellink-escrow/src/lib.rs`                                         |

Read [README.md](./README.md#architecture) before deeper changes.

## Reporting bugs

File an issue with:

1. Stellink version / commit hash
2. Browser + Freighter version
3. Network (testnet vs public)
4. Reproduction steps
5. What you expected vs what happened
6. Console logs / screenshots if relevant

## Maintainer responsibilities

A "maintainer" on this project is anyone with merge rights. Maintainers commit to:

- Triage incoming issues within 7 days
- Assign claimed issues within 24 hours, unassign stale claims after 7 days
- Review PRs within 7 days once the AI reviewer is at 5/5
- Tag releases following [SemVer](https://semver.org/) once we hit `v1.0.0`

If you'd like to step up to maintainer, open three meaningful merged PRs and ask in the discussion tracker.

## Code of conduct

Be kind. Be specific. Don't ship code you don't understand. That's it.
