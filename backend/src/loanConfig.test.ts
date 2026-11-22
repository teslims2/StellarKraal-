/**
 * Unit tests for the runtime loan origination-fee configuration (#1533).
 *
 * Covers:
 *  - the fee is read at runtime and defaults to 50 bps (0.5%)
 *  - the fee can be seeded from the ORIG_FEE_BPS env var
 *  - setOriginationFeeBps updates the runtime value and writes an audit entry
 *  - invalid values are rejected
 *  - a change to the fee does not alter an already-disbursed loan's snapshot
 */
import { insertLoan, getLoan, getOriginationFeeBps, setOriginationFeeBps, listAuditEntries } from "./db/store";

const BORROWER = "GASPH4OCYOERATXIKLPNURXUP7ISAQU2KWFB5XLUJ3LQHKHOCN3CEGD6";

describe("loan_config — runtime origination fee (#1533)", () => {
  afterEach(() => {
    // Reset to the default fee so test order does not leak state.
    setOriginationFeeBps(50, "test-teardown");
  });

  it("defaults to 50 basis points (0.5%) when ORIG_FEE_BPS is unset", () => {
    expect(getOriginationFeeBps()).toBe(50);
  });

  it("seeds the fee from the ORIG_FEE_BPS environment variable", () => {
    const previous = process.env.ORIG_FEE_BPS;
    process.env.ORIG_FEE_BPS = "75";
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const store = require("./db/store");
        expect(store.getOriginationFeeBps()).toBe(75);
      });
    } finally {
      if (previous === undefined) delete process.env.ORIG_FEE_BPS;
      else process.env.ORIG_FEE_BPS = previous;
    }
  });

  it("updates the runtime fee and records an audit entry", () => {
    const { feeBps, auditId } = setOriginationFeeBps(120, "admin-GABC");
    expect(feeBps).toBe(120);
    expect(auditId).toEqual(expect.stringContaining("audit_"));

    expect(getOriginationFeeBps()).toBe(120);

    const audits = listAuditEntries({ action: "UPDATE_LOAN_CONFIG" });
    expect(audits.total).toBeGreaterThanOrEqual(1);
    const entry = audits.data[0];
    expect(entry.userId).toBe("admin-GABC");
    expect(entry.resource).toBe("loan_config");
    expect(entry.resourceId).toBe("origination_fee_bps");
    expect(entry.requestBody).toMatchObject({ previous: 50, next: 120 });
  });

  it("rejects out-of-range and non-integer fee values", () => {
    expect(() => setOriginationFeeBps(-1, "admin")).toThrow();
    expect(() => setOriginationFeeBps(10_001, "admin")).toThrow();
    expect(() => setOriginationFeeBps(12.5, "admin")).toThrow();
    // A valid update still succeeds after the rejected ones.
    expect(setOriginationFeeBps(200, "admin").feeBps).toBe(200);
  });

  it("snapshots the fee at origination so a later change does not affect an existing loan", () => {
    setOriginationFeeBps(50, "admin");

    const originationFee = Math.floor((600_000 * 50) / 10_000);
    const loan = insertLoan({
      id: "loan-snapshot",
      borrower: BORROWER,
      collateral_id: "col-snapshot",
      amount: 600_000,
      origination_fee: originationFee,
      fee_percentage_bps: 50,
    });

    // Change the fee after origination.
    setOriginationFeeBps(300, "admin");
    expect(getOriginationFeeBps()).toBe(300);

    // The already-disbursed loan keeps its snapshot.
    const stored = getLoan(loan.id);
    expect(stored).toBeDefined();
    expect(stored!.origination_fee).toBe(originationFee);
    expect(stored!.fee_percentage_bps).toBe(50);
  });
});
