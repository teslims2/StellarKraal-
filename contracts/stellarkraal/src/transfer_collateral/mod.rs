//! # Transfer Collateral Module
//!
//! Implements `transfer_collateral`, which allows a livestock collateral owner
//! to transfer ownership of an unlocked collateral record to a new address.
//!
//! ## Motivation
//!
//! Livestock ownership changes through sale, inheritance, or other
//! off-chain arrangements.  Without an on-chain transfer mechanism the
//! new owner cannot use the collateral as backing for a loan.
//!
//! ## Behaviour
//!
//! | Condition | Result |
//! |---|---|
//! | `owner` matches stored owner and collateral is unlocked | Ownership updated; event emitted |
//! | `collateral_id` does not exist | [`crate::Error::CollateralNotFound`] |
//! | `owner` does not match stored owner | [`crate::Error::Unauthorized`] |
//! | Collateral is pledged to an active loan (`loan_id != 0`) | [`crate::Error::CollateralPledged`] |
//! | Contract is paused | [`crate::Error::ContractPaused`] |
//!
//! ## On-chain event
//!
//! ```text
//! topics : (symbol("collateral"), symbol("transferd"))
//! data   : (collateral_id: u64, old_owner: Address, new_owner: Address)
//! ```
//!
//! Note: the event symbol is `transferd` (8-char Soroban symbol limit).
//!
//! ## Security notes
//!
//! - Requires `require_auth()` from the **current owner** — the owner must
//!   sign the transaction.
//! - The new owner does **not** co-sign; the current owner bears full
//!   responsibility for choosing the transfer target.
//! - Collateral locked to an active loan (`loan_id != 0`) is blocked from
//!   transfer until the loan is repaid or liquidated, preventing removal
//!   of collateral backing from under an outstanding debt position.
//! - Transfer is blocked when the contract is paused.
//!
//! ## CLI invocation
//!
//! ```bash
//! stellar contract invoke \
//!   --id "$CONTRACT_ID" \
//!   --fn transfer_collateral \
//!   --arg address:$CURRENT_OWNER \
//!   --arg u64:$COLLATERAL_ID \
//!   --arg address:$NEW_OWNER \
//!   --source "$CURRENT_OWNER" \
//!   --network testnet \
//!   --rpc-url https://soroban-testnet.stellar.org
//! ```
//!
//! ## Implementation
//!
//! The function is implemented directly on the [`crate::StellarKraal`] contract
//! in `../lib.rs`.  This module serves as the canonical documentation and
//! may be extended with helper types in future iterations.
//!
//! ## Error codes
//!
//! | Code | Variant | Meaning |
//! |---|---|---|
//! | 3  | `Unauthorized`       | `owner` does not match the stored collateral owner. |
//! | 6  | `CollateralNotFound` | `collateral_id` does not exist in persistent storage. |
//! | 13 | `ContractPaused`     | Write operations blocked while the contract is paused. |
//! | 20 | `CollateralPledged`  | Collateral locked to an active loan; repay first. |
