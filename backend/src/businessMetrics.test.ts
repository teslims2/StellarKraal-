/**
 * Unit tests for business-level Prometheus metrics (issue #1506):
 * active_loans_total gauge and contract_rpc_duration_seconds histogram.
 */
import {
  registry,
  activeLoansTotal,
  updateActiveLoansGauge,
  contractRpcDurationSeconds,
  timeContractRpc,
} from "./metrics";

describe("active_loans_total", () => {
  beforeEach(() => activeLoansTotal.reset());

  it("is registered in the registry", () => {
    expect(registry.getSingleMetric("active_loans_total")).toBeDefined();
  });

  it("segments open loans by Active / AtRisk state", async () => {
    updateActiveLoansGauge([
      { status: "active" },
      { status: "active" },
      { status: "at_risk" },
      { status: "repaid" },
      { status: "liquidated" },
    ]);
    const { values } = await activeLoansTotal.get();
    const byState = Object.fromEntries(values.map((v) => [v.labels.state, v.value]));
    expect(byState).toEqual({ Active: 2, AtRisk: 1 });
  });

  it("reports zero for both states when there are no open loans", async () => {
    updateActiveLoansGauge([{ status: "active" }]);
    updateActiveLoansGauge([]);
    const { values } = await activeLoansTotal.get();
    const byState = Object.fromEntries(values.map((v) => [v.labels.state, v.value]));
    expect(byState).toEqual({ Active: 0, AtRisk: 0 });
  });
});

describe("contract_rpc_duration_seconds", () => {
  beforeEach(() => contractRpcDurationSeconds.reset());

  const countFor = async (method: string, status: string) => {
    const { values } = await contractRpcDurationSeconds.get();
    return (
      values.find(
        (v) =>
          v.metricName === "contract_rpc_duration_seconds_count" &&
          v.labels.method === method &&
          v.labels.status === status
      )?.value ?? 0
    );
  };

  it("is registered in the registry", () => {
    expect(registry.getSingleMetric("contract_rpc_duration_seconds")).toBeDefined();
  });

  it("records successful calls and returns the result", async () => {
    await expect(timeContractRpc("simulateTransaction", async () => 42)).resolves.toBe(42);
    expect(await countFor("simulateTransaction", "success")).toBe(1);
  });

  it("records failed calls with status=error and rethrows", async () => {
    await expect(
      timeContractRpc("getAccount", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await countFor("getAccount", "error")).toBe(1);
    expect(await countFor("getAccount", "success")).toBe(0);
  });
});
