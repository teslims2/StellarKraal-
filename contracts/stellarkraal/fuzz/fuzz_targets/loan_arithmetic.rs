#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;

#[derive(Arbitrary, Debug)]
struct LoanArithmeticInput {
    collateral_value: i128,
    liquidation_threshold_bps: u32,
    outstanding: i128,
    ltv_bps: u32,
    interest_rate_bps: u32,
    elapsed_seconds: u64,
}

fuzz_target!(|input: LoanArithmeticInput| {
    let _ = stellarkraal::compute_health_factor(
        input.collateral_value,
        input.liquidation_threshold_bps,
        input.outstanding,
    );
    let _ = stellarkraal::compute_ltv(input.collateral_value, input.ltv_bps);
    let _ = stellarkraal::compute_interest_accrual(
        input.outstanding,
        input.interest_rate_bps,
        input.elapsed_seconds,
    );
});
