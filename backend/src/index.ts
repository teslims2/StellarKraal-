import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import {
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import { SorobanRpc } from "@stellar/stellar-sdk";
import { z } from "zod";
import { stellarPublicKeySchema } from "./validators/stellar";
const { Server } = SorobanRpc;

const app = express();
app.use(cors());
app.use(express.json());

const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID || "";
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;

const server = new Server(RPC_URL);

// ── Validation Schemas ────────────────────────────────────────────────────────

const registerCollateralSchema = z.object({
  owner: stellarPublicKeySchema,
  animal_type: z.string().min(1),
  count: z.number().int().positive(),
  appraised_value: z.number().int().positive(),
});

const loanRequestSchema = z.object({
  borrower: stellarPublicKeySchema,
  collateral_id: z.number().int().nonnegative(),
  amount: z.number().int().positive(),
});

const loanRepaySchema = z.object({
  borrower: stellarPublicKeySchema,
  loan_id: z.number().int().nonnegative(),
  amount: z.number().int().positive(),
});

// ── helpers ──────────────────────────────────────────────────────────────────
async function buildContractTx(
  sourceAddress: string,
  method: string,
  args: xdr.ScVal[]
): Promise<string> {
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

// ── routes ────────────────────────────────────────────────────────────────────

// POST /api/collateral/register
app.post("/api/collateral/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = registerCollateralSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { owner, animal_type, count, appraised_value } = validation.data;
    const xdrTx = await buildContractTx(owner, "register_livestock", [
      new Address(owner).toScVal(),
      nativeToScVal(animal_type, { type: "symbol" }),
      nativeToScVal(count, { type: "u32" }),
      nativeToScVal(BigInt(appraised_value), { type: "i128" }),
    ]);
    res.json({ xdr: xdrTx });
  } catch (e) {
    next(e);
  }
});

// POST /api/loan/request
app.post("/api/loan/request", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = loanRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { borrower, collateral_id, amount } = validation.data;
    const xdrTx = await buildContractTx(borrower, "request_loan", [
      new Address(borrower).toScVal(),
      nativeToScVal(BigInt(collateral_id), { type: "u64" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
    ]);
    res.json({ xdr: xdrTx });
  } catch (e) {
    next(e);
  }
});

// POST /api/loan/repay
app.post("/api/loan/repay", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = loanRepaySchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { borrower, loan_id, amount } = validation.data;
    const xdrTx = await buildContractTx(borrower, "repay_loan", [
      new Address(borrower).toScVal(),
      nativeToScVal(BigInt(loan_id), { type: "u64" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
    ]);
    res.json({ xdr: xdrTx });
  } catch (e) {
    next(e);
  }
});

// GET /api/loan/:id
app.get("/api/loan/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = new Contract(CONTRACT_ID);
    const account = await server.getAccount(
      "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN" // fee-less read account
    );
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call("get_loan", nativeToScVal(BigInt(req.params.id), { type: "u64" }))
      )
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    res.json({ result: (result as any).result?.retval });
  } catch (e) {
    next(e);
  }
});

// GET /api/health/:loanId
app.get("/api/health/:loanId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = new Contract(CONTRACT_ID);
    const account = await server.getAccount(
      "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
    );
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          "health_factor",
          nativeToScVal(BigInt(req.params.loanId), { type: "u64" })
        )
      )
      .setTimeout(30)
      .build();

    const result = await server.simulateTransaction(tx);
    res.json({ health_factor: (result as any).result?.retval });
  } catch (e) {
    next(e);
  }
});

// ── error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => console.log(`StellarKraal API running on :${PORT}`));

export default app;
