import request from "supertest";
import app from "./index";

// Mock config to avoid env validation at import time
jest.mock("./config", () => ({
  config: {
    PORT: "3001",
    RPC_URL: "https://soroban-testnet.stellar.org",
    CONTRACT_ID: "CTEST",
    NEXT_PUBLIC_NETWORK: "testnet",
    RATE_LIMIT_GLOBAL: "60",
    RATE_LIMIT_WRITE: "10",
    TIMEOUT_GLOBAL_MS: "30000",
    TIMEOUT_WRITE_MS: "15000",
    POOL_MIN: "2",
    POOL_MAX: "10",
    APPRAISAL_CACHE_TTL_MS: "300000",
  },
}));

// Mock the logger
jest.mock("./utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock stellar-sdk to avoid real network calls
jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    Networks: { TESTNET: "Test SDF Network ; September 2015", PUBLIC: "Public Global Stellar Network ; September 2015" },
    BASE_FEE: "100",
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue({ type: "invokeHostFunction" }),
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({ toXDR: () => "mock_xdr_base64" }),
    })),
    Address: jest.fn().mockImplementation(() => ({
      toScVal: jest.fn().mockReturnValue({}),
    })),
    nativeToScVal: jest.fn().mockReturnValue({}),
    SorobanRpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: jest.fn().mockResolvedValue({ id: "GABC", sequence: "1" }),
        prepareTransaction: jest.fn().mockResolvedValue({ toXDR: () => "prepared_xdr" }),
        simulateTransaction: jest.fn().mockResolvedValue({ result: { retval: { value: 42 } } }),
        getHealth: jest.fn().mockResolvedValue({ status: "healthy" }),
      })),
    },
  };
});

describe("StellarKraal API", () => {
  describe("GET /api/health", () => {
    it("returns 200 with health status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("rpcReachable");
    });

    it("includes correct health data structure", async () => {
      const res = await request(app).get("/api/health");
      expect(res.body.status).toBe("healthy");
      expect(typeof res.body.version).toBe("string");
      expect(typeof res.body.uptime).toBe("number");
      expect(typeof res.body.rpcReachable).toBe("boolean");
    });
  });

  describe("POST /api/collateral/register", () => {
    it("returns xdr for valid payload", async () => {
      const res = await request(app).post("/api/collateral/register").send({
        owner: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        animal_type: "cattle",
        count: 5,
        appraised_value: 1000000,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 for missing fields", async () => {
      const res = await request(app).post("/api/collateral/register").send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app).post("/api/collateral/register").send({
        owner: "INVALID_KEY",
        animal_type: "cattle",
        count: 5,
        appraised_value: 1000000,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body.details[0].message).toContain("Stellar public key");
    });
  });

  describe("POST /api/loan/request", () => {
    it("returns xdr for valid payload", async () => {
      const res = await request(app).post("/api/loan/request").send({
        borrower: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        collateral_id: 1,
        amount: 600000,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app).post("/api/loan/request").send({
        borrower: "SAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        collateral_id: 1,
        amount: 600000,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  describe("POST /api/loan/repay", () => {
    it("returns xdr for valid payload with idempotency key", async () => {
      const res = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", "test-key-001")
        .send({
          borrower: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
          loan_id: 1,
          amount: 200000,
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 when Idempotency-Key header is missing", async () => {
      const res = await request(app).post("/api/loan/repay").send({
        borrower: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        loan_id: 1,
        amount: 200000,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Idempotency-Key/);
    });

    it("returns cached response for duplicate idempotency key", async () => {
      const key = `idem-dup-${Date.now()}`;
      const payload = {
        borrower: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        loan_id: 2,
        amount: 100000,
      };
      const first = await request(app).post("/api/loan/repay").set("Idempotency-Key", key).send(payload);
      const second = await request(app).post("/api/loan/repay").set("Idempotency-Key", key).send(payload);
      expect(second.status).toBe(first.status);
      expect(second.body).toEqual(first.body);
      expect(second.headers["x-idempotent-replayed"]).toBe("true");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app)
        .post("/api/loan/repay")
        .set("Idempotency-Key", "test-key-invalid")
        .send({
          borrower: "NOT_A_VALID_KEY",
          loan_id: 1,
          amount: 200000,
        });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
    });
  });

  describe("GET /api/loans (pagination)", () => {
    it("returns paginated envelope with defaults", async () => {
      const res = await request(app).get("/api/loans");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("page", 1);
      expect(res.body).toHaveProperty("pageSize", 20);
    });

    it("respects ?page and ?pageSize params", async () => {
      const res = await request(app).get("/api/loans?page=2&pageSize=10");
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(2);
      expect(res.body.pageSize).toBe(10);
    });

    it("returns 400 for invalid page param", async () => {
      const res = await request(app).get("/api/loans?page=0");
      expect(res.status).toBe(400);
    });

    it("returns 400 for pageSize > 100", async () => {
      const res = await request(app).get("/api/loans?pageSize=101");
      expect(res.status).toBe(400);
    });

    it("adds deprecation warning header when no pagination params", async () => {
      const res = await request(app).get("/api/loans");
      expect(res.headers["deprecation"]).toBe("true");
    });
  });

  describe("GET /api/loan/:id", () => {
    it("returns result for valid id", async () => {
      const res = await request(app).get("/api/loan/1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("result");
    });
  });

  describe("GET /api/health/:loanId", () => {
    it("returns health_factor for valid id", async () => {
      const res = await request(app).get("/api/health/1");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("health_factor");
    });
  });

  describe("Request ID middleware", () => {
    it("adds X-Request-ID header to response", async () => {
      const res = await request(app).get("/api/loan/1");
      expect(res.headers["x-request-id"]).toBeDefined();
      expect(res.headers["x-request-id"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe("Soft delete — collateral", () => {
    it("DELETE /api/collateral/:id returns 404 for unknown id", async () => {
      const res = await request(app).delete("/api/collateral/nonexistent-id");
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
    });

    it("GET /api/admin/deleted/collateral returns empty array initially", async () => {
      const res = await request(app).get("/api/admin/deleted/collateral");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("soft-deletes a collateral record and lists it under admin", async () => {
      // Seed a record directly via the store
      const { insertCollateral } = await import("./db/store");
      const record = insertCollateral({ id: "col-test-1", owner: "GABC", animal_type: "cattle", count: 2, appraised_value: 5000 });

      const del = await request(app).delete(`/api/collateral/${record.id}`);
      expect(del.status).toBe(200);
      expect(del.body).toEqual({ deleted: true, id: record.id });

      const listed = await request(app).get("/api/admin/deleted/collateral");
      expect(listed.body.some((r: any) => r.id === record.id)).toBe(true);
      expect(listed.body.find((r: any) => r.id === record.id).deletedAt).not.toBeNull();
    });

    it("returns 404 on double soft-delete", async () => {
      const { insertCollateral } = await import("./db/store");
      const record = insertCollateral({ id: "col-test-2", owner: "GABC", animal_type: "goat", count: 1, appraised_value: 1000 });
      await request(app).delete(`/api/collateral/${record.id}`);
      const res = await request(app).delete(`/api/collateral/${record.id}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Soft delete — loans", () => {
    it("DELETE /api/loan/:id returns 404 for unknown id", async () => {
      const res = await request(app).delete("/api/loan/nonexistent-id");
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
    });

    it("GET /api/admin/deleted/loans returns empty array initially", async () => {
      const res = await request(app).get("/api/admin/deleted/loans");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("soft-deletes a loan record and lists it under admin", async () => {
      const { insertLoan } = await import("./db/store");
      const record = insertLoan({ id: "loan-test-1", borrower: "GABC", collateral_id: "col-1", amount: 3000 });

      const del = await request(app).delete(`/api/loan/${record.id}`);
      expect(del.status).toBe(200);
      expect(del.body).toEqual({ deleted: true, id: record.id });

      const listed = await request(app).get("/api/admin/deleted/loans");
      expect(listed.body.some((r: any) => r.id === record.id)).toBe(true);
    });
  });

  describe("Admin restore", () => {
    it("POST /api/admin/restore/collateral/:id restores a soft-deleted record", async () => {
      const { insertCollateral } = await import("./db/store");
      const record = insertCollateral({ id: "col-restore-1", owner: "GABC", animal_type: "sheep", count: 3, appraised_value: 2000 });
      await request(app).delete(`/api/collateral/${record.id}`);

      const res = await request(app).post(`/api/admin/restore/collateral/${record.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ restored: true, id: record.id });

      // Should no longer appear in deleted list
      const listed = await request(app).get("/api/admin/deleted/collateral");
      expect(listed.body.some((r: any) => r.id === record.id)).toBe(false);
    });

    it("POST /api/admin/restore/collateral/:id returns 404 for non-deleted record", async () => {
      const res = await request(app).post("/api/admin/restore/collateral/does-not-exist");
      expect(res.status).toBe(404);
    });

    it("POST /api/admin/restore/loans/:id restores a soft-deleted loan", async () => {
      const { insertLoan } = await import("./db/store");
      const record = insertLoan({ id: "loan-restore-1", borrower: "GABC", collateral_id: "col-2", amount: 1500 });
      await request(app).delete(`/api/loan/${record.id}`);

      const res = await request(app).post(`/api/admin/restore/loans/${record.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ restored: true, id: record.id });
    });

    it("POST /api/admin/restore/loans/:id returns 404 for non-deleted loan", async () => {
      const res = await request(app).post("/api/admin/restore/loans/does-not-exist");
      expect(res.status).toBe(404);
    });
  });
});
