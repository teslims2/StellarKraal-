import request from "supertest";
import app from "../src/index";

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
      })),
    },
  };
});

describe("StellarKraal API", () => {
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
    it("returns xdr for valid payload", async () => {
      const res = await request(app).post("/api/loan/repay").send({
        borrower: "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        loan_id: 1,
        amount: 200000,
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("xdr");
    });

    it("returns 400 for invalid Stellar public key", async () => {
      const res = await request(app).post("/api/loan/repay").send({
        borrower: "NOT_A_VALID_KEY",
        loan_id: 1,
        amount: 200000,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
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
});
