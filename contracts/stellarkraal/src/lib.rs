#![no_std]
#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
    events,
};

// ── Storage keys ────────────────────────────────────────────────────────────
const ADMIN: Symbol = symbol_short!("ADMIN");
const ORACLE: Symbol = symbol_short!("ORACLE");
const TOKEN: Symbol = symbol_short!("TOKEN");
const LTV: Symbol = symbol_short!("LTV");        // loan-to-value bps  e.g. 6000 = 60%
const LIQ_THR: Symbol = symbol_short!("LIQTHR"); // liquidation threshold bps e.g. 8000
const SCHEMA_VER: Symbol = symbol_short!("SCHEMAVER"); // current schema version
const CURRENT_SCHEMA_VERSION: u32 = 1;

// ── Errors ───────────────────────────────────────────────────────────────────
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InsufficientCollateral = 4,
    LoanNotFound = 5,
    CollateralNotFound = 6,
    HealthFactorSafe = 7,
    InvalidAmount = 8,
    LoanAlreadyClosed = 9,
    AlreadyMigrated = 10,
}

// ── Types ────────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LoanStatus {
    Active,
    Repaid,
    Liquidated,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct CollateralRecord {
    pub owner: Address,
    pub animal_type: Symbol,  // "cattle" | "goat" | "sheep"
    pub count: u32,
    pub appraised_value: i128, // in stroops
    pub loan_id: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LoanRecord {
    pub id: u64,
    pub borrower: Address,
    pub collateral_id: u64,
    pub principal: i128,
    pub outstanding: i128,
    pub status: LoanStatus,
}

// ── Storage helpers ──────────────────────────────────────────────────────────
#[contracttype]
pub enum DataKey {
    Loan(u64),
    Collateral(u64),
    LoanCounter,
    CollateralCounter,
}

// ── Contract ─────────────────────────────────────────────────────────────────
#[contract]
pub struct StellarKraal;

#[contractimpl]
impl StellarKraal {
    // ── initialize ────────────────────────────────────────────────────────
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        token: Address,
        ltv_bps: u32,
        liquidation_threshold_bps: u32,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&ADMIN) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&ORACLE, &oracle);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&LTV, &ltv_bps);
        env.storage().instance().set(&LIQ_THR, &liquidation_threshold_bps);
        Ok(())
    }

    // ── register_livestock ────────────────────────────────────────────────
    pub fn register_livestock(
        env: Env,
        owner: Address,
        animal_type: Symbol,
        count: u32,
        appraised_value: i128,
    ) -> Result<u64, Error> {
        Self::assert_initialized(&env)?;
        if appraised_value <= 0 || count == 0 {
            return Err(Error::InvalidAmount);
        }
        owner.require_auth();

        let id = Self::next_id(&env, DataKey::CollateralCounter);
        let record = CollateralRecord {
            owner,
            animal_type,
            count,
            appraised_value,
            loan_id: 0,
        };
        env.storage().persistent().set(&DataKey::Collateral(id), &record);
        Ok(id)
    }

    // ── request_loan ──────────────────────────────────────────────────────
    pub fn request_loan(
        env: Env,
        borrower: Address,
        collateral_id: u64,
        amount: i128,
    ) -> Result<u64, Error> {
        Self::assert_initialized(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        borrower.require_auth();

        let collateral: CollateralRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Collateral(collateral_id))
            .ok_or(Error::CollateralNotFound)?;

        if collateral.owner != borrower {
            return Err(Error::Unauthorized);
        }

        let ltv: u32 = env.storage().instance().get(&LTV).unwrap();
        let max_loan = collateral.appraised_value
            .checked_mul(ltv as i128)
            .ok_or(Error::InvalidAmount)?
            / 10_000;

        if amount > max_loan {
            return Err(Error::InsufficientCollateral);
        }

        let loan_id = Self::next_id(&env, DataKey::LoanCounter);
        let loan = LoanRecord {
            id: loan_id,
            borrower: borrower.clone(),
            collateral_id,
            principal: amount,
            outstanding: amount,
            status: LoanStatus::Active,
        };
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);

        // Mark collateral as used
        let mut col = collateral;
        col.loan_id = loan_id;
        env.storage().persistent().set(&DataKey::Collateral(collateral_id), &col);

        // Disburse tokens
        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&env.current_contract_address(), &borrower, &amount);

        Ok(loan_id)
    }

    // ── repay_loan ────────────────────────────────────────────────────────
    pub fn repay_loan(env: Env, borrower: Address, loan_id: u64, amount: i128) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        borrower.require_auth();

        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;

        if loan.borrower != borrower {
            return Err(Error::Unauthorized);
        }
        if loan.status != LoanStatus::Active {
            return Err(Error::LoanAlreadyClosed);
        }

        let repay_amount = amount.min(loan.outstanding);
        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&borrower, &env.current_contract_address(), &repay_amount);

        loan.outstanding = loan.outstanding.checked_sub(repay_amount).ok_or(Error::InvalidAmount)?;
        if loan.outstanding == 0 {
            loan.status = LoanStatus::Repaid;
        }
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        Ok(())
    }

    // ── liquidate ─────────────────────────────────────────────────────────
    pub fn liquidate(env: Env, liquidator: Address, loan_id: u64) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        liquidator.require_auth();

        let mut loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;

        if loan.status != LoanStatus::Active {
            return Err(Error::LoanAlreadyClosed);
        }

        let hf = Self::compute_health_factor(&env, &loan)?;
        if hf >= 10_000 {
            return Err(Error::HealthFactorSafe);
        }

        // Transfer outstanding debt from liquidator to contract
        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&liquidator, &env.current_contract_address(), &loan.outstanding);

        loan.status = LoanStatus::Liquidated;
        loan.outstanding = 0;
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        Ok(())
    }

    // ── health_factor ─────────────────────────────────────────────────────
    /// Returns health factor in bps (10_000 = 1.0). Below 10_000 = liquidatable.
    pub fn health_factor(env: Env, loan_id: u64) -> Result<i128, Error> {
        Self::assert_initialized(&env)?;
        let loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;
        Self::compute_health_factor(&env, &loan)
    }

    // ── get_loan ──────────────────────────────────────────────────────────
    pub fn get_loan(env: Env, loan_id: u64) -> Result<LoanRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)
    }

    // ── get_collateral ────────────────────────────────────────────────────
    pub fn get_collateral(env: Env, collateral_id: u64) -> Result<CollateralRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Collateral(collateral_id))
            .ok_or(Error::CollateralNotFound)
    }

    // ── migrate ───────────────────────────────────────────────────────────
    /// Callable only by admin after a WASM upgrade. Idempotent: if the stored
    /// schema version already equals CURRENT_SCHEMA_VERSION it returns an error.
    /// Emits a `Migrated` event with the old and new version numbers.
    pub fn migrate(env: Env, admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        admin.require_auth();

        let old_version: u32 = env
            .storage()
            .instance()
            .get(&SCHEMA_VER)
            .unwrap_or(0u32);

        if old_version >= CURRENT_SCHEMA_VERSION {
            return Err(Error::AlreadyMigrated);
        }

        // ── schema transformations go here for each version bump ──────────
        // e.g. v0 → v1: no structural changes in this initial migration

        env.storage()
            .instance()
            .set(&SCHEMA_VER, &CURRENT_SCHEMA_VERSION);

        env.events().publish(
            (symbol_short!("Migrated"),),
            (old_version, CURRENT_SCHEMA_VERSION),
        );

        Ok(())
    }

    // ── get_schema_version ────────────────────────────────────────────────
    pub fn get_schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&SCHEMA_VER)
            .unwrap_or(0u32)
    }

    // ── internal helpers ──────────────────────────────────────────────────
    fn assert_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&ADMIN) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }

    fn next_id(env: &Env, key: DataKey) -> u64 {
        let id: u64 = env.storage().instance().get(&key).unwrap_or(0u64);
        let next = id + 1;
        env.storage().instance().set(&key, &next);
        next
    }

    fn compute_health_factor(env: &Env, loan: &LoanRecord) -> Result<i128, Error> {
        if loan.outstanding == 0 {
            return Ok(i128::MAX);
        }
        let collateral: CollateralRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Collateral(loan.collateral_id))
            .ok_or(Error::CollateralNotFound)?;

        let liq_thr: u32 = env.storage().instance().get(&LIQ_THR).unwrap();
        // health = (collateral_value * liq_threshold) / (outstanding * 10_000)
        let numerator = collateral
            .appraised_value
            .checked_mul(liq_thr as i128)
            .ok_or(Error::InvalidAmount)?;
        let denominator = loan.outstanding.checked_mul(10_000).ok_or(Error::InvalidAmount)?;
        Ok(numerator / denominator * 10_000)
    }
}
