# StellarKraal Soroban Contract Interface

This document describes the public interface for the `StellarKraal` Soroban smart contract in `contracts/stellarkraal/src/lib.rs`.
It covers contract functions, parameters, return values, error codes, on-chain state changes, and invocation examples using `stellar-cli`.

## Contract Overview

The contract manages livestock-backed loans with the following responsibilities:

- Register livestock as collateral.
- Accept loan requests against collateral value.
- Process loan repayments and liquidations.
- Enforce admin-controlled protocol parameters (fees, pause state, oracle configuration).
- Validate recipient-price updates from an external oracle and maintain TWAP pricing data.

## Public Functions

### `initialize(env, admin, oracle, token, treasury, ltv_bps, liquidation_threshold_bps)`
- Description: Set initial protocol parameters and default fee, treasury, loan, and price state.
- Parameters:
  - `admin` — admin address with permission to update protocol settings.
  - `oracle` — authorized oracle address for price submissions.
  - `token` — token address used for SAC disbursements and repayments.
  - `treasury` — fee recipient address.
  - `ltv_bps` — loan-to-value ratio in basis points (e.g. `6000` = 60%).
  - `liquidation_threshold_bps` — liquidation health threshold in basis points.
- Returns: `Result<(), Error>`.
- State changes: stores admin, oracle, token, treasury, LTV, liquidation threshold, fee rates, close factor, interest rate model, liquidity tracking, TWAP defaults, and oracle validation parameters.

### `is_paused(env)`
- Description: Query whether the contract is currently paused.
- Parameters: none.
- Returns: `bool`.
- State changes: none.

### `pause(env, admin)`
- Description: Pause contract write operations until expiry.
- Parameters: `admin` — must match the stored admin address.
- Returns: `Result<(), Error>`.
- State changes: sets pause flag and expiry timestamp, emits a pause event.

### `unpause(env, admin)`
- Description: Resume contract operations.
- Parameters: `admin` — must match the stored admin address.
- Returns: `Result<(), Error>`.
- State changes: clears pause state and expiry timestamp, emits an unpause event.

### `set_pause_duration(env, admin, duration)`
- Description: Update the default pause duration used by `pause()`.
- Parameters:
  - `admin` — admin address.
  - `duration` — duration in seconds.
- Returns: `Result<(), Error>`.
- State changes: updates `PAUSE_DUR`.

### `update_oracle(env, admin, new_oracle)`
- Description: Update the authorized oracle address.
- Parameters:
  - `admin` — admin address.
  - `new_oracle` — new oracle address.
- Returns: `Result<(), Error>`.
- State changes: updates `ORACLE`, emits an oracle update event.

### `set_animal_cap(env, admin, animal_type, max_value)`
- Description: Set the maximum accepted appraised value for a livestock type.
- Parameters:
  - `admin` — admin address.
  - `animal_type` — short symbol for livestock type.
  - `max_value` — maximum accepted appraised value in base units.
- Returns: `Result<(), Error>`.
- State changes: stores the cap for `animal_type`, emits an admin cap update event.
- Compatibility: animal types without a configured cap behave as if the cap is `u128::MAX`, so existing deployments remain unrestricted until the admin sets a cap.

### `set_liquidation_threshold(env, admin, threshold_bps)`
- Description: Update the liquidation threshold.
- Parameters:
  - `admin` — admin address.
  - `threshold_bps` — new threshold in basis points.
- Returns: `Result<(), Error>`.
- State changes: updates `LIQ_THR`, emits a threshold update event.

### `propose_new_admin(env, admin, new_admin)`
- Description: Start admin transfer by proposing a new admin address.
- Parameters:
  - `admin` — current admin address.
  - `new_admin` — proposed admin address.
- Returns: `Result<(), Error>`.
- State changes: stores `PENDING_ADMIN`, emits a proposal event.

### `accept_admin_role(env, new_admin)`
- Description: Accept admin role after it has been proposed.
- Parameters: `new_admin` — address that must match the pending admin.
- Returns: `Result<(), Error>`.
- State changes: replaces `ADMIN` with `PENDING_ADMIN`, clears `PENDING_ADMIN`, emits an admin update event.

### `register_livestock(env, owner, animal_type, count, appraised_value)`
- Description: Register a new collateral record for livestock.
- Parameters:
  - `owner` — collateral owner address.
  - `animal_type` — short symbol for livestock type.
  - `count` — number of animals.
  - `appraised_value` — oracle-appraised collateral value in base units.
- Returns: `Result<u64, Error>` — newly assigned collateral ID.
- State changes: creates `CollateralRecord` and stores it as unlocked collateral, emits a livestock registration event.

### `request_loan(env, borrower, collateral_ids, amount)`
- Description: Request a new loan secured by one or more collateral records.
- Parameters:
  - `borrower` — borrower address.
  - `collateral_ids` — list of collateral record IDs.
  - `amount` — requested gross loan amount in token base units.
- Returns: `Result<u64, Error>` — newly assigned loan ID.
- State changes: validates collateral ownership, locks collaterals, stores `LoanRecord`, transfers origination fee to treasury, disburses net amount to borrower, emits loan requested event.

### `repay_loan(env, borrower, loan_id, amount)`
- Description: Repay part or all of an active loan.
- Parameters:
  - `borrower` — loan borrower address.
  - `loan_id` — loan identifier.
  - `amount` — repayment amount.
- Returns: `Result<(), Error>`.
- State changes: transfers repayment into contract, deducts interest fee to treasury, reduces outstanding balance, updates status to `Repaid` when completed, emits loan repaid event.

### `liquidate(env, liquidator, loan_id, repay_amount)`
- Description: Liquidate a loan whose health factor is below 1.
- Parameters:
  - `liquidator` — liquidator address.
  - `loan_id` — loan identifier.
  - `repay_amount` — amount to repay subject to close-factor cap.
- Returns: `Result<(), Error>`.
- State changes: transfers repayment into contract, reduces outstanding balance, updates loan status to `Liquidated` if fully repaid, emits loan liquidated event.

### `set_close_factor(env, admin, close_factor_bps)`
- Description: Update the maximum liquidation repayment percentage.
- Parameters:
  - `admin` — admin address.
  - `close_factor_bps` — close factor in basis points.
- Returns: `Result<(), Error>`.
- State changes: updates `CLOSE_FACTOR`.

### `get_close_factor(env)`
- Description: Read the current close factor.
- Parameters: none.
- Returns: `Result<u32, Error>`.
- State changes: none.

### `health_factor(env, loan_id)`
- Description: Compute the health factor scaled by 10,000 for a loan.
- Parameters:
  - `loan_id` — loan identifier.
- Returns: `Result<i128, Error>`.
- State changes: none.

### `get_loan(env, loan_id)`
- Description: Read a loan record.
- Parameters:
  - `loan_id` — loan identifier.
- Returns: `Result<LoanRecord, Error>`.
- State changes: none.

### `get_collateral(env, collateral_id)`
- Description: Read a collateral record.
- Parameters:
  - `collateral_id` — collateral record identifier.
- Returns: `Result<CollateralRecord, Error>`.
- State changes: none.

### `get_loan_collaterals(env, loan_id)`
- Description: Return all collateral records backing a loan.
- Parameters:
  - `loan_id` — loan identifier.
- Returns: `Result<Vec<CollateralRecord>, Error>`.
- State changes: none.

### `update_fee_config(env, admin, origination_fee_bps, interest_fee_bps)`
- Description: Update origination and interest fee rates.
- Parameters:
  - `admin` — admin address.
  - `origination_fee_bps` — origination fee in basis points.
  - `interest_fee_bps` — interest fee in basis points.
- Returns: `Result<(), Error>`.
- State changes: updates `ORIG_FEE` and `INT_FEE`.

### `get_fee_config(env)`
- Description: Read the current fee configuration.
- Parameters: none.
- Returns: `Result<FeeConfig, Error>`.
- State changes: none.

### `set_interest_rate_model(env, admin, base_rate_bps, slope1_bps, slope2_bps, kink_bps)`
- Description: Update the jump-rate interest model.
- Parameters:
  - `admin` — admin address.
  - `base_rate_bps` — base interest rate in basis points.
  - `slope1_bps` — slope below the kink.
  - `slope2_bps` — slope above the kink.
  - `kink_bps` — utilization kink point in basis points.
- Returns: `Result<(), Error>`.
- State changes: updates `BASE_RATE`, `SLOPE1`, `SLOPE2`, and `KINK`.

### `get_interest_rate_model(env)`
- Description: Read the current interest rate model.
- Parameters: none.
- Returns: `Result<InterestRateModel, Error>`.
- State changes: none.

### `get_current_interest_rate(env)`
- Description: Compute the current interest rate from utilization.
- Parameters: none.
- Returns: `Result<u32, Error>`.
- State changes: none.

> **Oracle design:** The protocol supports multiple registered oracles with on-chain median aggregation and a configurable quorum (`add_oracle`, `remove_oracle`, `get_oracles`, `submit_oracle_prices`), in addition to the single-oracle `submit_price` + TWAP path documented below. For the trust model, dispute handling, the relationship to the off-chain appraisal cache (`backend/src/utils/appraisalCache.ts`), and rationale, see [ADR-006: Oracle design](../adr/ADR-006-oracle-design.md).

### `set_oracle_config(env, admin, price_min, price_max, staleness_threshold, max_deviation_bps)`
- Description: Configure price bounds and freshness validation.
- Parameters:
  - `admin` — admin address.
  - `price_min` — minimum accepted price (0 disables lower bound).
  - `price_max` — maximum accepted price (0 disables upper bound).
  - `staleness_threshold` — maximum age of a price update in seconds.
  - `max_deviation_bps` — maximum allowable deviation from the last price.
- Returns: `Result<(), Error>`.
- State changes: updates oracle validation settings.

### `get_oracle_config(env)`
- Description: Read the current oracle validation settings.
- Parameters: none.
- Returns: `Result<OracleConfig, Error>`.
- State changes: none.

### `submit_price(env, oracle, price, price_timestamp)`
- Description: Submit a new oracle price with validation and TWAP tracking.
- Parameters:
  - `oracle` — authorized oracle address.
  - `price` — new price in base units.
  - `price_timestamp` — timestamp associated with the price.
- Returns: `Result<(), Error>`.
- State changes: updates latest price, TWAP accumulators, and publish price state.

### `get_twap_data(env)`
- Description: Read current TWAP pricing state.
- Parameters: none.
- Returns: `Result<TWAPData, Error>`.
- State changes: none.

### `set_twap_window(env, admin, window_seconds)`
- Description: Update the TWAP averaging window.
- Parameters:
  - `admin` — admin address.
  - `window_seconds` — window length in seconds.
- Returns: `Result<(), Error>`.
- State changes: updates `TWAP_WINDOW`.

## Error Codes

| Code | Error | Meaning |
|---|---|---|
| 1 | `NotInitialized` | Contract has not been initialized. |
| 2 | `AlreadyInitialized` | `initialize()` already executed. |
| 3 | `Unauthorized` | Caller is not authorized for the operation. |
| 4 | `InsufficientCollateral` | Requested loan exceeds LTV-backed collateral. |
| 5 | `LoanNotFound` | Loan ID does not exist. |
| 6 | `CollateralNotFound` | Collateral ID does not exist. |
| 7 | `HealthFactorSafe` | Loan health factor is healthy; liquidation not allowed. |
| 8 | `InvalidAmount` | Numeric argument is zero, negative, or overflows. |
| 9 | `LoanAlreadyClosed` | Loan is already repaid or liquidated. |
| 10 | `InvalidFeeRate` | Fee rate exceeds protocol maximum. |
| 11 | `ExceedsCloseFactor` | Liquidation repayment exceeds close factor cap. |
| 12 | `InvalidCloseFactor` | Close factor is out of bounds. |
| 13 | `ContractPaused` | Contract is paused and write operations are blocked. |
| 14 | `AlreadyInProgress` | Reentrancy guard prevented nested execution. |
| 15 | `NotPaused` | Attempted unpause while contract is not paused. |
| 16 | `AlreadyPaused` | Attempted pause while contract is already paused. |
| 17 | `PriceBelowMin` | Oracle price below configured minimum. |
| 18 | `PriceAboveMax` | Oracle price above configured maximum. |
| 19 | `PriceStale` | Submitted price is too old. |
| 20 | `PriceDeviationExceeded` | Price change exceeds allowed deviation. |

## On-Chain State

Key contract storage state used by the interface:

- `ADMIN`, `PENDING_ADMIN` — admin authority and pending admin transfer.
- `ORACLE` — authorized oracle address.
- `AnimalCap(animal_type)` — optional per-animal-type maximum appraised value.
- `TOKEN`, `TREASURY` — token and treasury addresses.
- `LTV`, `LIQ_THR`, `ORIG_FEE`, `INT_FEE`, `CLOSE_FACTOR` — protocol parameters.
- `PAUSED`, `PAUSE_EXP`, `PAUSE_DUR` — pause control state.
- `CollateralRecord` and `LoanRecord` persistent storage keyed by IDs.
- `BASE_RATE`, `SLOPE1`, `SLOPE2`, `KINK` — interest rate model parameters.
- `TOTAL_BORROWED`, `TOTAL_LIQUIDITY` — liquidity tracking state.
- `LAST_PRICE`, `LAST_PRICE_TIME`, `TWAP_PRICE`, `TWAP_SUM`, `TWAP_COUNT`, `TWAP_WINDOW` — oracle price and TWAP state.
- `PRICE_MIN`, `PRICE_MAX`, `STALE_THR`, `DEV_BPS` — oracle validation configuration.

## Invoking the Contract with `stellar-cli`

Examples assume a deployed contract ID and Soroban testnet environment.

```bash
export CONTRACT_ID=G...YOUR_CONTRACT_ID...
export RPC_URL=https://soroban-testnet.stellar.org
export NETWORK=testnet
```

### Initialize the contract

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --fn initialize \
  --arg address:$ADMIN_ADDRESS \
  --arg address:$ORACLE_ADDRESS \
  --arg address:$TOKEN_ADDRESS \
  --arg address:$TREASURY_ADDRESS \
  --arg u32:6000 \
  --arg u32:8000 \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source "$ADMIN_ADDRESS"
```

### Register livestock collateral

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --fn register_livestock \
  --arg address:$OWNER_ADDRESS \
  --arg symbol:cattle \
  --arg u32:5 \
  --arg i128:1000000 \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source "$OWNER_ADDRESS"
```

### Request a loan

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --fn request_loan \
  --arg address:$BORROWER_ADDRESS \
  --arg vec:u64:$COLLATERAL_ID1,$COLLATERAL_ID2 \
  --arg i128:500000 \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source "$BORROWER_ADDRESS"
```

### Submit a new oracle price

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --fn submit_price \
  --arg address:$ORACLE_ADDRESS \
  --arg i128:125000 \
  --arg u64:$(date +%s) \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --source "$ORACLE_ADDRESS"
```

### Query a loan record

```bash
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --fn get_loan \
  --arg u64:$LOAN_ID \
  --network "$NETWORK" \
  --rpc-url "$RPC_URL"
```

## Notes

- The contract uses `submit_price` to validate oracle updates before they affect TWAP state.
- Repayments are allowed even when the contract is paused, while new loans and liquidations are blocked.
- Liquidations are only permitted when `health_factor` is below 10,000 and the repay amount does not exceed `CLOSE_FACTOR`.
