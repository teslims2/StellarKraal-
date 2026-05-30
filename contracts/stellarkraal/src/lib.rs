#![no_std]
#[cfg(test)]
mod tests;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
    Vec,
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
const PAUSED: Symbol = symbol_short!("PAUSED");   // pause state flag
const PAUSE_EXP: Symbol = symbol_short!("PAUSEXP"); // pause expiry timestamp
const ORACLES: Symbol = symbol_short!("ORACLES");

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
    ContractPaused = 13,
    OracleAlreadyRegistered = 14,
    OracleLimitReached = 15,
    OracleNotFound = 16,
    InsufficientOracleQuorum = 17,
    InvalidPrice = 18,
    NotPaused = 19,
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
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleReport {
    pub median: i128,
    pub responses: u32,
    pub flagged_count: u32,
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
            env.events().publish((symbol_short!("FeeCol"), loan_id), (symbol_short!("originate"), fee));
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
            env.events().publish((symbol_short!("FeeCol"), loan_id), (symbol_short!("interest"), interest_fee));
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

    // ── set_pause_duration ────────────────────────────────────────────────
    pub fn set_pause_duration(env: Env, admin: Address, duration: u64) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).ok_or(Error::NotInitialized)?;
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&symbol_short!("PAUSEDUR"), &duration);
        Ok(())
    }

    // ── pause ─────────────────────────────────────────────────────────────
    pub fn pause(env: Env, admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).ok_or(Error::NotInitialized)?;
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&PAUSED, &true);
        let duration: u64 = env.storage().instance().get(&symbol_short!("PAUSEDUR")).unwrap_or(0);
        if duration > 0 {
            let expires_at = env.ledger().timestamp().checked_add(duration).ok_or(Error::InvalidAmount)?;
            env.storage().instance().set(&PAUSE_EXP, &expires_at);
        } else {
            env.storage().instance().set(&PAUSE_EXP, &0u64);
        }
        Ok(())
    }

    // ── unpause ───────────────────────────────────────────────────────────
    pub fn unpause(env: Env, admin: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).ok_or(Error::NotInitialized)?;
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
        if !paused {
            return Err(Error::NotPaused);
        }
        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&PAUSE_EXP, &0u64);
        Ok(())
    }

    // ── add_oracle ────────────────────────────────────────────────────────
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).ok_or(Error::NotInitialized)?;
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        
        let mut oracles = Self::get_oracles(env.clone());
        if oracles.contains(&oracle) {
            return Err(Error::OracleAlreadyRegistered);
        }
        if oracles.len() >= 5 {
            return Err(Error::OracleLimitReached);
        }
        oracles.push_back(oracle);
        env.storage().instance().set(&ORACLES, &oracles);
        Ok(())
    }

    // ── remove_oracle ─────────────────────────────────────────────────────
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) -> Result<(), Error> {
        Self::assert_initialized(&env)?;
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).ok_or(Error::NotInitialized)?;
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }
        
        let mut oracles = Self::get_oracles(env.clone());
        let mut index = None;
        for i in 0..oracles.len() {
            if oracles.get(i).unwrap() == oracle {
                index = Some(i);
                break;
            }
        }
        if let Some(idx) = index {
            oracles.remove(idx);
            env.storage().instance().set(&ORACLES, &oracles);
            Ok(())
        } else {
            Err(Error::OracleNotFound)
        }
    }

    // ── get_oracles ───────────────────────────────────────────────────────
    pub fn get_oracles(env: Env) -> Vec<Address> {
        if let Some(oracles) = env.storage().instance().get::<_, Vec<Address>>(&ORACLES) {
            oracles
        } else {
            let mut oracles = Vec::new(&env);
            if let Some(oracle) = env.storage().instance().get::<_, Address>(&ORACLE) {
                oracles.push_back(oracle);
            }
            oracles
        }
    }

    // ── submit_oracle_prices ──────────────────────────────────────────────
    pub fn submit_oracle_prices(
        env: Env,
        submitter: Address,
        prices: Vec<i128>,
    ) -> Result<OracleReport, Error> {
        Self::assert_initialized(&env)?;
        submitter.require_auth();
        
        let oracles = Self::get_oracles(env.clone());
        if prices.len() != oracles.len() {
            return Err(Error::InvalidPrice);
        }
        
        let mut non_zero_prices = Vec::new(&env);
        let mut responses = 0;
        for price in prices.iter() {
            if price > 0 {
                non_zero_prices.push_back(price);
                responses += 1;
            }
        }
        
        let min_quorum = if oracles.len() >= 3 { 3 } else { oracles.len() };
        if responses < min_quorum {
            return Err(Error::InsufficientOracleQuorum);
        }
        
        let mut arr = [0i128; 5];
        for i in 0..responses {
            arr[i as usize] = non_zero_prices.get(i).unwrap();
        }
        
        // Bubble sort
        for i in 0..responses {
            for j in (i+1)..responses {
                if arr[i as usize] > arr[j as usize] {
                    let tmp = arr[i as usize];
                    arr[i as usize] = arr[j as usize];
                    arr[j as usize] = tmp;
                }
            }
        }
        
        let median = if responses % 2 == 1 {
            arr[(responses / 2) as usize]
        } else {
            let mid = (responses / 2) as usize;
            (arr[mid - 1] + arr[mid]) / 2
        };
        
        let mut flagged_count = 0;
        for price in prices.iter() {
            if price > 0 {
                let diff = if price > median { price - median } else { median - price };
                if median > 0 && diff * 100 > median * 50 {
                    flagged_count += 1;
                }
            }
        }
        
        Ok(OracleReport {
            median,
            responses,
            flagged_count,
        })
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
        if expires_at == 0 {
            return true;
        }
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
}
