# Stellink Roadmap

The roadmap is organised by horizon, not by date. Each item links back to a GitHub issue once the issue is filed; items without a link are open for proposal.

## v0.1 — Working Stellar testnet MVP **(current)**

- [x] One-time, recurring, and escrow payment links
- [x] Freighter wallet integration
- [x] XLM + USDC payments via `Operation.payment`
- [x] Native escrow via `Operation.createClaimableBalance`
- [x] Auto-refund predicate (`predicateNot(predicateBeforeRelativeTime)`)
- [x] Soroban registry contract scaffold (`register_link`, `get_link`)
- [x] Supabase + localStorage hybrid storage
- [x] Stellar Expert deep links

## v0.2 — Polish + production readiness

- [ ] **USDC trustline auto-creation flow** — detect missing trustline, prompt the user, build a `changeTrust` op. *(`good-first-issue`)*
- [ ] **Multi-wallet support** via [`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) — Albedo, xBull, Lobstr, Hana. *(`help-wanted`)*
- [ ] **PocketBase API rule hardening** — replace permissive public read/write rules with creator-scoped ones tied to a Stellar SEP-10 challenge. *(`security`)*
- [ ] **Frontend test harness** — set up Vitest + React Testing Library, port `lib/types.ts` helpers as a starter suite. *(`good-first-issue`)*
- [ ] **Escrow status sync from chain** — poll Horizon for the claimable balance state instead of trusting the cached status field. *(`help-wanted`)*
- [x] **QR code rendering** for payment links — point-of-sale use case. *(`good-first-issue`)*

## v0.3 — Soroban contract

- [x] **Implement `appeal_link`** — record an on-chain appeal flag, gated by either creator or a recipient address committed at registration time. *(`good-first-issue`, see `lib.rs:appeal_link`)*
- [x] **Implement `resolve_appeal`** — arbiter-only entrypoint that emits a binding decision event; off-chain UI surfaces the resolution. *(`help-wanted`, see `lib.rs:resolve_appeal`)*
- [x] **Wire frontend to call `register_link`** after a successful claimable-balance creation — gated by `VITE_STELLINK_ESCROW_CONTRACT_ID`. *(`good-first-issue`)*
- [ ] **Deployment script** — bash + Soroban CLI one-shot for testnet + mainnet. *(`devops`)*
- [ ] **`.well-known/stellar.toml`** for SEP-10 auth used by Supabase RLS (links to v0.2 item).

## v0.4 — Velocity features

- [ ] **Email + webhook notifications** — recipient notified when escrow is funded, payer notified when claimed. *(`feature`)*
- [ ] **Anchor on/off-ramp integration** — recipient can withdraw USDC to fiat via a Stellar anchor (e.g. MoneyGram, Anclap). *(`feature`)*
- [x] **Mobile-first responsive pass** — current layout breaks on viewports under 360 px. *(`good-first-issue`)*
- [ ] **i18n** — Spanish + Portuguese first, then community-driven. *(`help-wanted`)*

## v1.0 — Mainnet launch

- [ ] Full audit of the Soroban contract by an external reviewer
- [ ] Mainnet deployment guide
- [ ] Public Stellar Expert verified contract listing
- [ ] Documented operational runbook for incident response

## Issue labels

| Label                | Meaning                                                 |
|----------------------|---------------------------------------------------------|
| `good-first-issue`   | Self-contained, ~1 hour for a new contributor           |
| `help-wanted`        | Open to anyone, larger scope                            |
| `security`           | Touches auth, RLS, signatures, contract authorisation   |
| `feature`            | New user-facing capability                              |
| `bug`                | Something doesn't work as documented                    |
| `devops`             | Deploy, CI, infra                                       |

If you're new, start with `good-first-issue`. Open a comment before you start — we're happy to mentor.
