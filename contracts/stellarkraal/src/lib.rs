#![no_std]
#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
    Vec, events,
};

// ── Storage keys ────────────────────────────────────────────────────────────
const ADMIN: Symbol = symbol_short!("ADMIN");
const ORACLE: Symbol = symbol_short!("ORACLE");
const TOKEN: Symbol = symbol_short!("TOKEN");
const LTV: Symbol = symbol_short!("LTV");        // loan-to-value bps  e.g. 6000 = 60%
const LIQ_THR: Symbol = symbol_short!("LIQTHR"); // liquidation threshold bps e.g. 8000
const TREASURY: Symbol = symbol_short!("TREASURY");
const ORIG_FEE: Symbol = symbol_short!("ORIGFEE"); // origination fee bps e.g. 50 = 0.5%
const INT_FEE: Symbol = symbol_short!("INTFEE");   // interest fee bps e.g. 1000 = 10%
const CLOSE_FACTOR: Symbol = symbol_short!("CLSFACT"); // close factor bps e.g. 5000 = 50%
const TOTAL_BORROWED: Symbol = symbol_short!("TOTBOR"); // total borrowed amount
const TOTAL_LIQUIDITY: Symbol = symbol_short!("TOTLIQ"); // total available liquidity
const BASE_RATE: Symbol = symbol_short!("BASERT"); // base interest rate bps
const SLOPE1: Symbol = symbol_short!("SLP1");    // slope below kink bps
const SLOPE2: Symbol = symbol_short!("SLP2");    // slope above kink bps
const KINK: Symbol = symbol_short!("KINK");      // utilization kink point bps

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
    InvalidFeeRate = 10,
    ExceedsCloseFactor = 11,
    InvalidCloseFactor = 12,
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
    pub animal_type: Symbol,
    pub count: u32,
    pub appraised_value: i128,
    pub loan_id: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct LoanRecord {
    pub id: u64,
    pub borrower: Address,
    pub collateral_ids: Vec<u64>,
    pub total_collateral_value: i128,
    pub principal: i128,
    pub outstanding: i128,
    pub status: LoanStatus,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FeeConfig {
    pub origination_fee_bps: u32,
    pub interest_fee_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct InterestRateModel {
    pub base_rate_bps: u32,      // base interest rate in basis points
    pub slope1_bps: u32,         // slope below kink in basis points
    pub slope2_bps: u32,         // slope above kink in basis points
    pub kink_bps: u32,           // utilization kink point in basis points
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
        treasury: Address,
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
        env.storage().instance().set(&TREASURY, &treasury);
        env.storage().instance().set(&LTV, &ltv_bps);
        env.storage().instance().set(&LIQ_THR, &liquidation_threshold_bps);
        env.storage().instance().set(&ORIG_FEE, &50u32); // 0.5%
        env.storage().instance().set(&INT_FEE, &1000u32); // 10%
        env.storage().instance().set(&CLOSE_FACTOR, &5000u32); // 50%
        
        // Initialize interest rate model (Compound-like jump rate model)
        // base_rate: 2%, slope1: 5%, slope2: 45%, kink: 80%
        env.storage().instance().set(&BASE_RATE, &200u32);
        env.storage().instance().set(&SLOPE1, &500u32);
        env.storage().instance().set(&SLOPE2, &4500u32);
        env.storage().instance().set(&KINK, &8000u32);
        
        // Initialize liquidity tracking
        env.storage().instance().set(&TOTAL_BORROWED, &0i128);
        env.storage().instance().set(&TOTAL_LIQUIDITY, &0i128);
        Ok(())
    }

    // ── is_paused ─────────────────────────────────────────────────────────
    pub fn is_paused(env: Env) -> bool {
        Self::is_paused_raw(&env)
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
        Self::assert_not_paused(&env)?;
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
        collateral_ids: Vec<u64>,
        amount: i128,
    ) -> Result<u64, Error> {
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if collateral_ids.is_empty() {
            return Err(Error::CollateralNotFound);
        }
        borrower.require_auth();

        // Sum appraised values across all collaterals, verify ownership
        let mut total_collateral_value: i128 = 0;
        for col_id in collateral_ids.iter() {
            let collateral: CollateralRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Collateral(col_id))
                .ok_or(Error::CollateralNotFound)?;
            if collateral.owner != borrower {
                return Err(Error::Unauthorized);
            }
            total_collateral_value = total_collateral_value
                .checked_add(collateral.appraised_value)
                .ok_or(Error::InvalidAmount)?;
        }

        let ltv: u32 = env.storage().instance().get(&LTV).unwrap();
        let max_loan = total_collateral_value
            .checked_mul(ltv as i128)
            .ok_or(Error::InvalidAmount)?
            / 10_000;

        if amount > max_loan {
            return Err(Error::InsufficientCollateral);
        }

        // Calculate origination fee
        let orig_fee_bps: u32 = env.storage().instance().get(&ORIG_FEE).unwrap();
        let fee = amount.checked_mul(orig_fee_bps as i128).ok_or(Error::InvalidAmount)? / 10_000;
        let disbursement = amount.checked_sub(fee).ok_or(Error::InvalidAmount)?;

        let loan_id = Self::next_id(&env, DataKey::LoanCounter);
        let loan = LoanRecord {
            id: loan_id,
            borrower: borrower.clone(),
            collateral_ids: collateral_ids.clone(),
            total_collateral_value,
            principal: amount,
            outstanding: amount,
            status: LoanStatus::Active,
        };
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);

        // Mark all collaterals as locked to this loan
        for col_id in collateral_ids.iter() {
            let mut col: CollateralRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Collateral(col_id))
                .unwrap();
            col.loan_id = loan_id;
            env.storage().persistent().set(&DataKey::Collateral(col_id), &col);
        }

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer fee to treasury
        if fee > 0 {
            let treasury: Address = env.storage().instance().get(&TREASURY).unwrap();
            token_client.transfer(&env.current_contract_address(), &treasury, &fee);
            env.events().publish((symbol_short!("FeeCollect"), loan_id), (symbol_short!("originate"), fee));
        }

        // Disburse net amount to borrower
        token_client.transfer(&env.current_contract_address(), &borrower, &disbursement);

        Ok(loan_id)
    }

    // ── repay_loan ────────────────────────────────────────────────────────
    /// Repayment is allowed even when paused (per spec).
    pub fn repay_loan(env: Env, borrower: Address, loan_id: u64, amount: i128) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        // NOTE: repayment intentionally NOT blocked by pause
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
        
        // Calculate interest (amount above principal) and fee
        let principal_remaining = loan.outstanding.min(loan.principal);
        let interest_portion = if repay_amount > principal_remaining {
            repay_amount - principal_remaining
        } else {
            0
        };
        
        let int_fee_bps: u32 = env.storage().instance().get(&INT_FEE).unwrap();
        let interest_fee = interest_portion.checked_mul(int_fee_bps as i128).ok_or(Error::InvalidAmount)? / 10_000;

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&borrower, &env.current_contract_address(), &repay_amount);

        // Transfer interest fee to treasury
        if interest_fee > 0 {
            let treasury: Address = env.storage().instance().get(&TREASURY).unwrap();
            token_client.transfer(&env.current_contract_address(), &treasury, &interest_fee);
            env.events().publish((symbol_short!("FeeCollect"), loan_id), (symbol_short!("interest"), interest_fee));
        }

        loan.outstanding = loan.outstanding.checked_sub(repay_amount).ok_or(Error::InvalidAmount)?;
        if loan.outstanding == 0 {
            loan.status = LoanStatus::Repaid;
        }
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        Ok(())
    }

    // ── liquidate ─────────────────────────────────────────────────────────
    /// `repay_amount`: how much debt the liquidator wants to repay.
    /// Must be > 0 and ≤ outstanding * close_factor / 10_000.
    pub fn liquidate(env: Env, liquidator: Address, loan_id: u64, repay_amount: i128) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_not_paused(&env)?;
        if repay_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
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

        // Enforce close factor cap
        let close_factor: u32 = env.storage().instance().get(&CLOSE_FACTOR).unwrap();
        let max_repay = loan.outstanding
            .checked_mul(close_factor as i128)
            .ok_or(Error::InvalidAmount)?
            / 10_000;
        if repay_amount > max_repay {
            return Err(Error::ExceedsCloseFactor);
        }

        let token_addr: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&liquidator, &env.current_contract_address(), &repay_amount);

        loan.outstanding = loan.outstanding.checked_sub(repay_amount).ok_or(Error::InvalidAmount)?;
        if loan.outstanding == 0 {
            loan.status = LoanStatus::Liquidated;
        }
        env.storage().persistent().set(&DataKey::Loan(loan_id), &loan);
        Ok(())
    }

    // ── set_close_factor ──────────────────────────────────────────────────
    pub fn set_close_factor(env: Env, admin: Address, close_factor_bps: u32) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        // Must be between 1 bps and 100% (10_000 bps)
        if close_factor_bps == 0 || close_factor_bps > 10_000 {
            return Err(Error::InvalidCloseFactor);
        }
        env.storage().instance().set(&CLOSE_FACTOR, &close_factor_bps);
        Ok(())
    }

    // ── get_close_factor ──────────────────────────────────────────────────
    pub fn get_close_factor(env: Env) -> Result<u32, Error> {
        Self::assert_initialized(&env)?;
        Ok(env.storage().instance().get(&CLOSE_FACTOR).unwrap())
    }

    // ── health_factor ─────────────────────────────────────────────────────
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

    // ── get_loan_collaterals ──────────────────────────────────────────────
    pub fn get_loan_collaterals(env: Env, loan_id: u64) -> Result<Vec<CollateralRecord>, Error> {
        let loan: LoanRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Loan(loan_id))
            .ok_or(Error::LoanNotFound)?;
        let mut records: Vec<CollateralRecord> = Vec::new(&env);
        for col_id in loan.collateral_ids.iter() {
            let col: CollateralRecord = env
                .storage()
                .persistent()
                .get(&DataKey::Collateral(col_id))
                .ok_or(Error::CollateralNotFound)?;
            records.push_back(col);
        }
        Ok(records)
    }

    // ── update_fee_config ─────────────────────────────────────────────────
    pub fn update_fee_config(
        env: Env,
        admin: Address,
        origination_fee_bps: u32,
        interest_fee_bps: u32,
    ) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        admin.require_auth();

        if origination_fee_bps > 500 || interest_fee_bps > 500 {
            return Err(Error::InvalidFeeRate);
        }

        env.storage().instance().set(&ORIG_FEE, &origination_fee_bps);
        env.storage().instance().set(&INT_FEE, &interest_fee_bps);
        Ok(())
    }

    // ── get_fee_config ────────────────────────────────────────────────────
    pub fn get_fee_config(env: Env) -> Result<FeeConfig, Error> {
        Self::assert_initialized(&env)?;
        let orig: u32 = env.storage().instance().get(&ORIG_FEE).unwrap();
        let int: u32 = env.storage().instance().get(&INT_FEE).unwrap();
        Ok(FeeConfig {
            origination_fee_bps: orig,
            interest_fee_bps: int,
        })
    }

    // ── set_interest_rate_model ───────────────────────────────────────────
    pub fn set_interest_rate_model(
        env: Env,
        admin: Address,
        base_rate_bps: u32,
        slope1_bps: u32,
        slope2_bps: u32,
        kink_bps: u32,
    ) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        Self::assert_admin(&env, &admin)?;
        admin.require_auth();
        
        // Validate parameters
        if kink_bps == 0 || kink_bps > 10_000 {
            return Err(Error::InvalidAmount);
        }
        
        env.storage().instance().set(&BASE_RATE, &base_rate_bps);
        env.storage().instance().set(&SLOPE1, &slope1_bps);
        env.storage().instance().set(&SLOPE2, &slope2_bps);
        env.storage().instance().set(&KINK, &kink_bps);
        Ok(())
    }

    // ── get_interest_rate_model ───────────────────────────────────────────
    pub fn get_interest_rate_model(env: Env) -> Result<InterestRateModel, Error> {
        Self::assert_initialized(&env)?;
        let base: u32 = env.storage().instance().get(&BASE_RATE).unwrap_or(200);
        let slope1: u32 = env.storage().instance().get(&SLOPE1).unwrap_or(500);
        let slope2: u32 = env.storage().instance().get(&SLOPE2).unwrap_or(4500);
        let kink: u32 = env.storage().instance().get(&KINK).unwrap_or(8000);
        Ok(InterestRateModel {
            base_rate_bps: base,
            slope1_bps: slope1,
            slope2_bps: slope2,
            kink_bps: kink,
        })
    }

    // ── get_current_interest_rate ─────────────────────────────────────────
    /// Returns the current interest rate in basis points based on utilization
    pub fn get_current_interest_rate(env: Env) -> Result<u32, Error> {
        Self::assert_initialized(&env)?;
        let utilization = Self::calculate_utilization(&env)?;
        Ok(Self::calculate_interest_rate(&env, utilization)?)
    }

    // ── internal helpers ──────────────────────────────────────────────────
    fn assert_initialized(env: &Env) -> Result<(), Error> {
        if !env.storage().instance().has(&ADMIN) {
            return Err(Error::NotInitialized);
        }
        Ok(())
    }

    fn assert_admin(env: &Env, caller: &Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if *caller != admin {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn is_paused_raw(env: &Env) -> bool {
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if !paused {
            return false;
        }
        // Check auto-expiry
        let expires_at: u64 = env.storage().instance().get(&PAUSE_EXP).unwrap_or(0);
        let now = env.ledger().timestamp();
        now < expires_at
    }

    fn assert_not_paused(env: &Env) -> Result<(), Error> {
        if Self::is_paused_raw(env) {
            return Err(Error::ContractPaused);
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
        let liq_thr: u32 = env.storage().instance().get(&LIQ_THR).unwrap();
        // health = (total_collateral_value * liq_threshold) / (outstanding * 10_000)
        let numerator = loan
            .total_collateral_value
            .checked_mul(liq_thr as i128)
            .ok_or(Error::InvalidAmount)?;
        let denominator = loan.outstanding.checked_mul(10_000).ok_or(Error::InvalidAmount)?;
        Ok(numerator / denominator * 10_000)
    }

    fn calculate_utilization(env: &Env) -> Result<u32, Error> {
        let total_borrowed: i128 = env.storage().instance().get(&TOTAL_BORROWED).unwrap_or(0);
        let total_liquidity: i128 = env.storage().instance().get(&TOTAL_LIQUIDITY).unwrap_or(1);
        
        if total_liquidity <= 0 {
            return Ok(0);
        }
        
        // utilization = (total_borrowed / total_liquidity) * 10_000
        let utilization = (total_borrowed * 10_000 / total_liquidity) as u32;
        Ok(utilization.min(10_000))
    }

    fn calculate_interest_rate(env: &Env, utilization_bps: u32) -> Result<u32, Error> {
        let base: u32 = env.storage().instance().get(&BASE_RATE).unwrap_or(200);
        let slope1: u32 = env.storage().instance().get(&SLOPE1).unwrap_or(500);
        let slope2: u32 = env.storage().instance().get(&SLOPE2).unwrap_or(4500);
        let kink: u32 = env.storage().instance().get(&KINK).unwrap_or(8000);
        
        // Jump rate model:
        // if utilization <= kink:
        //   rate = base + (slope1 * utilization / 10_000)
        // else:
        //   rate = base + (slope1 * kink / 10_000) + (slope2 * (utilization - kink) / 10_000)
        
        let rate = if utilization_bps <= kink {
            let slope1_component = (slope1 as u64)
                .checked_mul(utilization_bps as u64)
                .unwrap_or(u64::MAX)
                / 10_000;
            base.checked_add(slope1_component as u32).unwrap_or(u32::MAX)
        } else {
            let slope1_component = (slope1 as u64)
                .checked_mul(kink as u64)
                .unwrap_or(u64::MAX)
                / 10_000;
            let excess_util = utilization_bps.saturating_sub(kink);
            let slope2_component = (slope2 as u64)
                .checked_mul(excess_util as u64)
                .unwrap_or(u64::MAX)
                / 10_000;
            base
                .checked_add(slope1_component as u32)
                .and_then(|r| r.checked_add(slope2_component as u32))
                .unwrap_or(u32::MAX)
        };
        
        Ok(rate)
    }
}
