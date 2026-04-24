#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
        Address, Env, IntoVal,
    };

    fn setup() -> (Env, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, StellarKraal);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let token = Address::generate(&env);
        (env, contract_id, admin, oracle, token)
    }

    fn init(env: &Env, contract_id: &Address, admin: &Address, oracle: &Address, token: &Address) {
        let client = StellarKraalClient::new(env, contract_id);
        client.initialize(admin, oracle, token, &6000u32, &8000u32);
    }

    // ── initialize ────────────────────────────────────────────────────────
    #[test]
    fn test_initialize_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_initialize_twice_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        init(&env, &cid, &admin, &oracle, &token);
    }

    // ── register_livestock ────────────────────────────────────────────────
    #[test]
    fn test_register_livestock_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let id = client.register_livestock(&owner, &symbol_short!("cattle"), &5u32, &1_000_000i128);
        assert_eq!(id, 1);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_register_zero_count_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        client.register_livestock(&owner, &symbol_short!("goat"), &0u32, &500_000i128);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_register_zero_value_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        client.register_livestock(&owner, &symbol_short!("sheep"), &3u32, &0i128);
    }

    // ── request_loan ──────────────────────────────────────────────────────
    #[test]
    fn test_request_loan_within_ltv() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        // max loan = 1_000_000 * 60% = 600_000
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        assert_eq!(loan_id, 1);
    }

    #[test]
    #[should_panic(expected = "InsufficientCollateral")]
    fn test_request_loan_exceeds_ltv() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        client.request_loan(&borrower, &col_id, &700_000i128);
    }

    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_request_loan_wrong_owner() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let attacker = Address::generate(&env);
        let col_id = client.register_livestock(&owner, &symbol_short!("goat"), &3u32, &500_000i128);
        client.request_loan(&attacker, &col_id, &100_000i128);
    }

    // ── repay_loan ────────────────────────────────────────────────────────
    #[test]
    fn test_partial_repay() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.repay_loan(&borrower, &loan_id, &200_000i128);
        let loan = client.get_loan(&loan_id);
        assert_eq!(loan.outstanding, 400_000);
    }

    #[test]
    fn test_full_repay_marks_repaid() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.repay_loan(&borrower, &loan_id, &600_000i128);
        let loan = client.get_loan(&loan_id);
        assert_eq!(loan.status, LoanStatus::Repaid);
    }

    #[test]
    #[should_panic(expected = "LoanAlreadyClosed")]
    fn test_repay_closed_loan_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.repay_loan(&borrower, &loan_id, &600_000i128);
        client.repay_loan(&borrower, &loan_id, &1i128); // should panic
    }

    // ── health_factor ─────────────────────────────────────────────────────
    #[test]
    fn test_health_factor_healthy() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        let hf = client.health_factor(&loan_id);
        // hf = (1_000_000 * 8000) / (600_000 * 10_000) * 10_000 = 13_333
        assert!(hf >= 10_000, "health factor should be >= 1.0");
    }

    // ── liquidate ─────────────────────────────────────────────────────────
    #[test]
    #[should_panic(expected = "HealthFactorSafe")]
    fn test_liquidate_healthy_loan_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let liquidator = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.liquidate(&liquidator, &loan_id);
    }

    // ── get_loan / get_collateral ─────────────────────────────────────────
    #[test]
    fn test_get_loan_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("sheep"), &10u32, &2_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &500_000i128);
        let loan = client.get_loan(&loan_id);
        assert_eq!(loan.principal, 500_000);
        assert_eq!(loan.borrower, borrower);
    }

    #[test]
    fn test_get_collateral_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let col_id = client.register_livestock(&owner, &symbol_short!("goat"), &7u32, &700_000i128);
        let col = client.get_collateral(&col_id);
        assert_eq!(col.count, 7);
        assert_eq!(col.appraised_value, 700_000);
    }

    #[test]
    #[should_panic(expected = "LoanNotFound")]
    fn test_get_nonexistent_loan_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.get_loan(&999u64);
    }

    #[test]
    #[should_panic(expected = "CollateralNotFound")]
    fn test_get_nonexistent_collateral_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.get_collateral(&999u64);
    }

    // ── not initialized guard ─────────────────────────────────────────────
    #[test]
    #[should_panic(expected = "NotInitialized")]
    fn test_register_without_init_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register_contract(None, StellarKraal);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        client.register_livestock(&owner, &symbol_short!("cattle"), &1u32, &100_000i128);
    }

    // ── invalid amount guards ─────────────────────────────────────────────
    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_request_zero_amount_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        client.request_loan(&borrower, &col_id, &0i128);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_repay_zero_amount_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.repay_loan(&borrower, &loan_id, &0i128);
    }

    // ── multiple loans counter ────────────────────────────────────────────
    #[test]
    fn test_multiple_collaterals_increment_ids() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let id1 = client.register_livestock(&owner, &symbol_short!("cattle"), &1u32, &500_000i128);
        let id2 = client.register_livestock(&owner, &symbol_short!("goat"), &2u32, &300_000i128);
        assert_eq!(id2, id1 + 1);
    }

    #[test]
    fn test_repay_more_than_outstanding_caps_at_outstanding() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        // Repay more than outstanding — should cap and mark Repaid
        client.repay_loan(&borrower, &loan_id, &999_999_999i128);
        let loan = client.get_loan(&loan_id);
        assert_eq!(loan.status, LoanStatus::Repaid);
        assert_eq!(loan.outstanding, 0);
    }

    // ── migrate ───────────────────────────────────────────────────────────
    #[test]
    fn test_migrate_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        // Before migration schema version is 0
        assert_eq!(client.get_schema_version(), 0);
        client.migrate(&admin);
        assert_eq!(client.get_schema_version(), 1);
    }

    #[test]
    #[should_panic(expected = "AlreadyMigrated")]
    fn test_migrate_idempotent() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.migrate(&admin);
        client.migrate(&admin); // second call must fail
    }

    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_migrate_non_admin_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let attacker = Address::generate(&env);
        client.migrate(&attacker);
    }
}
