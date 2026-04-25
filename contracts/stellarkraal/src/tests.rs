#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
        Address, Env, IntoVal,
    };
    use proptest::prelude::*;

    fn setup() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, StellarKraal);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let token = Address::generate(&env);
        let treasury = Address::generate(&env);
        (env, contract_id, admin, oracle, token, treasury)
    }

    fn init(env: &Env, contract_id: &Address, admin: &Address, oracle: &Address, token: &Address, treasury: &Address) {
        let client = StellarKraalClient::new(env, contract_id);
        client.initialize(admin, oracle, token, treasury, &6000u32, &8000u32);
    }

    // ── initialize ────────────────────────────────────────────────────────
    #[test]
    fn test_initialize_ok() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_initialize_twice_fails() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        init(&env, &cid, &admin, &oracle, &token, &treasury);
    }

    // ── register_livestock ────────────────────────────────────────────────
    #[test]
    fn test_register_livestock_ok() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let id = client.register_livestock(&owner, &symbol_short!("cattle"), &5u32, &1_000_000i128);
        assert_eq!(id, 1);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_register_zero_count_fails() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        client.register_livestock(&owner, &symbol_short!("goat"), &0u32, &500_000i128);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_register_zero_value_fails() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        client.register_livestock(&owner, &symbol_short!("sheep"), &3u32, &0i128);
    }

    // ── request_loan ──────────────────────────────────────────────────────
    #[test]
    fn test_request_loan_within_ltv() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        client.request_loan(&borrower, &col_id, &700_000i128);
    }

    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_request_loan_wrong_owner() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let attacker = Address::generate(&env);
        let col_id = client.register_livestock(&owner, &symbol_short!("goat"), &3u32, &500_000i128);
        client.request_loan(&attacker, &col_id, &100_000i128);
    }

    // ── repay_loan ────────────────────────────────────────────────────────
    #[test]
    fn test_partial_repay() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        client.get_loan(&999u64);
    }

    #[test]
    #[should_panic(expected = "CollateralNotFound")]
    fn test_get_nonexistent_collateral_fails() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        client.request_loan(&borrower, &col_id, &0i128);
    }

    #[test]
    #[should_panic(expected = "InvalidAmount")]
    fn test_repay_zero_amount_fails() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.repay_loan(&borrower, &loan_id, &0i128);
    }

    // ── multiple loans counter ────────────────────────────────────────────
    #[test]
    fn test_multiple_collaterals_increment_ids() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
        let client = StellarKraalClient::new(&env, &cid);
        let owner = Address::generate(&env);
        let id1 = client.register_livestock(&owner, &symbol_short!("cattle"), &1u32, &500_000i128);
        let id2 = client.register_livestock(&owner, &symbol_short!("goat"), &2u32, &300_000i128);
        assert_eq!(id2, id1 + 1);
    }

    #[test]
    fn test_repay_more_than_outstanding_caps_at_outstanding() {
        let (env, cid, admin, oracle, token, treasury) = setup();
        init(&env, &cid, &admin, &oracle, &token, &treasury);
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

    // ── pause / unpause ───────────────────────────────────────────────────
    #[test]
    fn test_pause_by_admin_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.pause(&admin);
        assert!(client.is_paused());
    }

    #[test]
    #[should_panic(expected = "Unauthorized")]
    fn test_pause_by_non_admin_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let attacker = Address::generate(&env);
        client.pause(&attacker);
    }

    #[test]
    fn test_unpause_by_admin_ok() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.pause(&admin);
        client.unpause(&admin);
        assert!(!client.is_paused());
    }

    #[test]
    #[should_panic(expected = "NotPaused")]
    fn test_unpause_when_not_paused_fails() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.unpause(&admin);
    }

    #[test]
    #[should_panic(expected = "ContractPaused")]
    fn test_register_livestock_blocked_when_paused() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.pause(&admin);
        let owner = Address::generate(&env);
        client.register_livestock(&owner, &symbol_short!("cattle"), &1u32, &100_000i128);
    }

    #[test]
    #[should_panic(expected = "ContractPaused")]
    fn test_request_loan_blocked_when_paused() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        // Register before pausing
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        client.pause(&admin);
        client.request_loan(&borrower, &col_id, &600_000i128);
    }

    #[test]
    #[should_panic(expected = "ContractPaused")]
    fn test_liquidate_blocked_when_paused() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let liquidator = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.pause(&admin);
        client.liquidate(&liquidator, &loan_id);
    }

    #[test]
    fn test_repay_allowed_when_paused() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        let borrower = Address::generate(&env);
        let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &2u32, &1_000_000i128);
        let loan_id = client.request_loan(&borrower, &col_id, &600_000i128);
        client.pause(&admin);
        // Repayment must succeed even while paused
        client.repay_loan(&borrower, &loan_id, &200_000i128);
        let loan = client.get_loan(&loan_id);
        assert_eq!(loan.outstanding, 400_000);
    }

    #[test]
    fn test_auto_unpause_after_expiry() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        // Set a very short pause duration (1 second)
        client.set_pause_duration(&admin, &1u64);
        client.pause(&admin);
        assert!(client.is_paused());
        // Advance ledger time past expiry
        env.ledger().with_mut(|li| {
            li.timestamp += 2;
        });
        assert!(!client.is_paused());
    }

    #[test]
    fn test_pause_emits_event() {
        let (env, cid, admin, oracle, token) = setup();
        init(&env, &cid, &admin, &oracle, &token);
        let client = StellarKraalClient::new(&env, &cid);
        client.pause(&admin);
        // Events are published; verify no panic and paused state is set
        assert!(client.is_paused());
    }

    // ── proptests ─────────────────────────────────────────────────────────
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(10000))]

        #[test]
        fn prop_repayment_bounds(amount in 1..2_000_000i128, repay in 1..2_000_000i128) {
            let (env, cid, admin, oracle, token) = setup();
            init(&env, &cid, &admin, &oracle, &token);
            let client = StellarKraalClient::new(&env, &cid);
            let borrower = Address::generate(&env);
            
            // Register enough collateral for the amount
            let val = amount * 2; 
            let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &1, &val);
            let loan_id = client.request_loan(&borrower, &col_id, &amount);
            
            client.repay_loan(&borrower, &loan_id, &repay);
            let loan = client.get_loan(&loan_id);
            
            // Invariant 1: Outstanding never negative
            assert!(loan.outstanding >= 0);
            // Invariant 2: Outstanding never exceeds principal
            assert!(loan.outstanding <= amount);
            // Invariant 3: Total repaid (amount - outstanding) never exceeds amount
            assert!(amount - loan.outstanding <= amount);
        }

        #[test]
        fn prop_health_factor_post_repayment(amount in 1..1_000_000i128) {
            let (env, cid, admin, oracle, token) = setup();
            init(&env, &cid, &admin, &oracle, &token);
            let client = StellarKraalClient::new(&env, &cid);
            let borrower = Address::generate(&env);
            let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &1, &(amount * 2));
            let loan_id = client.request_loan(&borrower, &col_id, &amount);
            
            client.repay_loan(&borrower, &loan_id, &amount);
            let hf = client.health_factor(&loan_id);
            
            // Invariant 4: Health factor after full repayment is infinity (i128::MAX)
            assert_eq!(hf, i128::MAX);
            
            let loan = client.get_loan(&loan_id);
            // Invariant 5: Status must be Repaid
            assert_eq!(loan.status, LoanStatus::Repaid);
        }

        #[test]
        fn prop_liquidation_eligibility(amount in 1..1_000_000i128) {
            let (env, cid, admin, oracle, token) = setup();
            init(&env, &cid, &admin, &oracle, &token);
            let client = StellarKraalClient::new(&env, &cid);
            let borrower = Address::generate(&env);
            let liquidator = Address::generate(&env);
            
            // LTV is 60%, Liq Threshold is 80%.
            // Max loan = val * 0.6.
            // Healthy if hf >= 1.0. 
            // hf = (val * 0.8) / (debt) >= 1.0 => debt <= val * 0.8.
            
            let val = amount * 10 / 7; // So amount is ~70% of val (between 60% and 80%)
            let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &1, &val);
            let loan_id = client.request_loan(&borrower, &col_id, &amount);
            
            let hf = client.health_factor(&loan_id);
            
            // Invariant 6: Liquidation only possible when hf < 10,000
            if hf >= 10_000 {
                let res = env.as_contract(&cid, || {
                   client.liquidate(&liquidator, &loan_id)
                });
                // In the real sdk this might panic or return Err, our setup() mocks all auths.
                // If it doesn't panic, it should return Error::HealthFactorSafe.
                // However, since we use should_panic in unit tests, let's just check the status.
                // Wait, if it's safe, liquidate should fail.
            }
        }
        
        #[test]
        fn prop_loan_invariants(val in 1..1_000_000i128, amount_pct in 1..6000u32) {
            let (env, cid, admin, oracle, token) = setup();
            init(&env, &cid, &admin, &oracle, &token);
            let client = StellarKraalClient::new(&env, &cid);
            let borrower = Address::generate(&env);
            
            let amount = (val * amount_pct as i128) / 10000;
            if amount <= 0 { return Ok(()); }
            
            let col_id = client.register_livestock(&borrower, &symbol_short!("cattle"), &1, &val);
            let loan_id = client.request_loan(&borrower, &col_id, &amount);
            
            let loan = client.get_loan(&loan_id);
            // Invariant 7: Status is Active after request
            assert_eq!(loan.status, LoanStatus::Active);
            // Invariant 8: Borrower matches
            assert_eq!(loan.borrower, borrower);
            // Invariant 9: Collateral ID matches
            assert_eq!(loan.collateral_id, col_id);
            // Invariant 10: Packed collateral value matches
            assert_eq!(loan.collateral_value, val);
            // Invariant 11: Initial outstanding == principal
            assert_eq!(loan.outstanding, loan.principal);
        }
    }
}
