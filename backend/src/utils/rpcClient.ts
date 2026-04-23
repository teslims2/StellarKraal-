import { SorobanRpc } from "@stellar/stellar-sdk";
import CircuitBreaker from "opossum";

const { Server } = SorobanRpc;

const RPC_URL = process.env.RPC_URL || "https://soroban-testnet.stellar.org";

// Create the base RPC server instance
const baseServer = new Server(RPC_URL);

/**
 * Circuit breaker options:
 * - timeout: 10 seconds for RPC calls
 * - errorThresholdPercentage: 50% error rate triggers opening
 * - resetTimeout: 60 seconds before attempting to close circuit
 * - rollingCountTimeout: 10 seconds window for error calculation
 * - rollingCountBuckets: 10 buckets for rolling window
 * - volumeThreshold: 5 requests minimum before circuit can open
 */
const circuitBreakerOptions = {
  timeout: 10000, // 10 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 60000, // 60 seconds
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  volumeThreshold: 5, // Minimum 5 requests before circuit can open
  name: "stellar-rpc",
};

/**
 * Retry configuration:
 * - maxRetries: 3 attempts
 * - exponential backoff: 1s, 2s, 4s
 */
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

/**
 * Exponential backoff delay calculation
 */
function getRetryDelay(attempt: number): number {
  return BASE_DELAY * Math.pow(2, attempt);
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < MAX_RETRIES - 1) {
        const delay = getRetryDelay(attempt);
        console.warn(
          `RPC ${operationName} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`RPC ${operationName} failed after ${MAX_RETRIES} attempts`);
  throw lastError;
}

/**
 * Wrapped RPC methods with retry logic
 */
const rpcMethods = {
  getAccount: async (address: string) => {
    return withRetry(
      () => baseServer.getAccount(address),
      `getAccount(${address})`
    );
  },

  prepareTransaction: async (tx: any) => {
    return withRetry(
      () => baseServer.prepareTransaction(tx),
      "prepareTransaction"
    );
  },

  simulateTransaction: async (tx: any) => {
    return withRetry(
      () => baseServer.simulateTransaction(tx),
      "simulateTransaction"
    );
  },

  getHealth: async () => {
    return withRetry(
      () => baseServer.getHealth(),
      "getHealth"
    );
  },
};

/**
 * Create circuit breakers for each RPC method
 */
const getAccountBreaker = new CircuitBreaker(
  rpcMethods.getAccount,
  circuitBreakerOptions
);
const prepareTransactionBreaker = new CircuitBreaker(
  rpcMethods.prepareTransaction,
  circuitBreakerOptions
);
const simulateTransactionBreaker = new CircuitBreaker(
  rpcMethods.simulateTransaction,
  circuitBreakerOptions
);
const getHealthBreaker = new CircuitBreaker(
  rpcMethods.getHealth,
  circuitBreakerOptions
);

// Circuit breaker event logging
[
  getAccountBreaker,
  prepareTransactionBreaker,
  simulateTransactionBreaker,
  getHealthBreaker,
].forEach((breaker) => {
  breaker.on("open", () => {
    console.error(`Circuit breaker opened for ${breaker.name}`);
  });

  breaker.on("halfOpen", () => {
    console.info(`Circuit breaker half-open for ${breaker.name}`);
  });

  breaker.on("close", () => {
    console.info(`Circuit breaker closed for ${breaker.name}`);
  });
});

/**
 * RPC client with circuit breaker and retry logic
 */
export const rpcClient = {
  getAccount: (address: string) => getAccountBreaker.fire(address),
  prepareTransaction: (tx: any) => prepareTransactionBreaker.fire(tx),
  simulateTransaction: (tx: any) => simulateTransactionBreaker.fire(tx),
  getHealth: () => getHealthBreaker.fire(),
  
  /**
   * Get circuit breaker states for health check
   */
  getCircuitStates: () => ({
    getAccount: getAccountBreaker.opened ? "open" : "closed",
    prepareTransaction: prepareTransactionBreaker.opened ? "open" : "closed",
    simulateTransaction: simulateTransactionBreaker.opened ? "open" : "closed",
    getHealth: getHealthBreaker.opened ? "open" : "closed",
  }),

  /**
   * Check if any circuit is open
   */
  isHealthy: () => {
    return (
      !getAccountBreaker.opened &&
      !prepareTransactionBreaker.opened &&
      !simulateTransactionBreaker.opened &&
      !getHealthBreaker.opened
    );
  },
};

export default rpcClient;
