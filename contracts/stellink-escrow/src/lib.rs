//! Stellink — minimal Soroban escrow registry.
//!
//! Most of Stellink's escrow flow is handled by Stellar's native primitive,
//! `createClaimableBalance`. That gives us multi-claimant predicates,
//! auto-refund timeouts, and on-chain custody for free.
//!
//! This contract layers a thin **registry** on top so that:
//!   - Each payment link gets a stable on-chain id (the Stellar address that
//!     created it + the link's UUID).
//!   - A 3rd-party arbiter can be designated to resolve disputes when both
//!     parties file an appeal.
//!   - Off-chain link metadata can be content-addressed by a hash committed
//!     on-chain, so a future indexer can verify integrity.
//!
//! ## Status
//!
//! This crate is a **scaffold**. The `register_link` instruction is wired
//! end-to-end and tested. Two further entry points are stubbed and tagged
//! with `// TODO(contributor)` markers — see `ROADMAP.md` and the GitHub
//! issues labelled `good-first-issue` for the full design notes.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, Address, BytesN, Env, Symbol, symbol_short, String,
};

#[contract]
pub struct StellinkEscrow;

/* ------------------------------------------------------------------ */
/* Storage                                                            */
/* ------------------------------------------------------------------ */

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    /// `LinkRecord` keyed by content-addressed link hash.
    Link(BytesN<32>),
    /// Optional global arbiter address (set once at deploy time).
    Arbiter,
}

/// On-chain handle to a Stellink link. We do not store the full link
/// metadata (recipient, amount, memo, …) because that lives off-chain in
/// Supabase + the Stellar claimable balance itself. We only commit the
/// 32-byte hash of the canonical link record so it's tamper-evident.
#[derive(Clone)]
#[contracttype]
pub struct LinkRecord {
    pub creator: Address,
    pub recipient: Option<Address>,
    pub created_at: u64,
    /// Hex-encoded Stellar claimable balance id, or `None` if the link is
    /// non-escrow (one-time / recurring).
    pub claimable_balance_id: Option<String>,
    /// Free-form 32-byte tag the off-chain linker can use (e.g. SHA-256 of
    /// the JSON record).
    pub metadata_hash: BytesN<32>,
    pub appealed: bool,
    pub decision: u32,
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

const EVT_REGISTERED: Symbol = symbol_short!("REG");

/* ------------------------------------------------------------------ */
/* Errors                                                             */
/* ------------------------------------------------------------------ */

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// A link with this id is already registered.
    LinkAlreadyExists = 1,
    /// No link with this id exists.
    LinkNotFound = 2,
    /// Caller is not authorised for this action.
    Unauthorised = 3,
    /// Feature not yet implemented (see issue tracker).
    NotImplemented = 100,
}

/* ------------------------------------------------------------------ */
/* Implementation                                                     */
/* ------------------------------------------------------------------ */

#[contractimpl]
impl StellinkEscrow {
    /// One-time initialisation. Sets the optional global arbiter.
    pub fn init(env: Env, arbiter: Option<Address>) {
        if let Some(addr) = arbiter {
            env.storage().instance().set(&DataKey::Arbiter, &addr);
        }
    }

    /// Register a new payment link on-chain. The caller must be the link's
    /// creator and must authorise the call.
    ///
    /// `link_id` should be a 32-byte content-addressed identifier (e.g.
    /// SHA-256 of the canonical link JSON record). It is unique.
    pub fn register_link(
        env: Env,
        creator: Address,
        recipient: Option<Address>,
        link_id: BytesN<32>,
        claimable_balance_id: Option<String>,
        metadata_hash: BytesN<32>,
    ) -> Result<(), Error> {
        creator.require_auth();

        let key = DataKey::Link(link_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::LinkAlreadyExists);
        }

        let record = LinkRecord {
            creator: creator.clone(),
            recipient,
            created_at: env.ledger().timestamp(),
            claimable_balance_id,
            metadata_hash,
            appealed: false,
            decision: 0,
        };
        env.storage().persistent().set(&key, &record);

        env.events().publish((EVT_REGISTERED, creator), link_id);

        Ok(())
    }

    /// Read a link record. Returns `None` if it doesn't exist.
    pub fn get_link(env: Env, link_id: BytesN<32>) -> Option<LinkRecord> {
        env.storage().persistent().get(&DataKey::Link(link_id))
    }

    /// Get the configured arbiter, if any.
    pub fn arbiter(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Arbiter)
    }

    /// **TODO(contributor)** — `appeal_link` should mark a registered link
    /// as appealed. Either party (creator OR recipient stored elsewhere)
    /// must be able to call it. See issue #5 (`good-first-issue`).
    pub fn appeal_link(_env: Env, _link_id: BytesN<32>, _caller: Address) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }

    /// **TODO(contributor)** — `resolve_appeal` should be callable only by
    /// the arbiter and emits a binding decision (release or refund). See
    /// issue #6.
    pub fn resolve_appeal(
        _env: Env,
        _link_id: BytesN<32>,
        _decision: u32,
    ) -> Result<(), Error> {
        Err(Error::NotImplemented)
    }
}

#[cfg(test)]
mod test;
