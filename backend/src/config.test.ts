import { z } from "zod";

describe("Environment Validation", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    jest.resetModules();
  });

  it("should validate required environment variables", () => {
    // Clear required env vars
    delete process.env.RPC_URL;
    delete process.env.CONTRACT_ID;

    expect(() => {
      jest.isolateModules(() => {
        require("./config");
      });
    }).toThrow("process.exit called");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation failed")
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("should accept valid environment variables", () => {
    process.env.RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.CONTRACT_ID = "test-contract-id";
    process.env.PORT = "3001";

    expect(() => {
      jest.isolateModules(() => {
        require("./config");
      });
    }).not.toThrow();
  });

  it("should use default values for optional variables", () => {
    process.env.RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.CONTRACT_ID = "test-contract-id";
    delete process.env.PORT;
    delete process.env.RATE_LIMIT_GLOBAL;

    let config: any;
    jest.isolateModules(() => {
      config = require("./config").config;
    });

    expect(config.PORT).toBe("3001");
    expect(config.RATE_LIMIT_GLOBAL).toBe("60");
  });

  it("should validate URL format for RPC_URL", () => {
    process.env.RPC_URL = "not-a-valid-url";
    process.env.CONTRACT_ID = "test-contract-id";

    expect(() => {
      jest.isolateModules(() => {
        require("./config");
      });
    }).toThrow("process.exit called");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("RPC_URL must be a valid URL")
    );
  });

  it("should validate numeric string format", () => {
    process.env.RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.CONTRACT_ID = "test-contract-id";
    process.env.PORT = "not-a-number";

    expect(() => {
      jest.isolateModules(() => {
        require("./config");
      });
    }).toThrow("process.exit called");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("PORT must be a valid number")
    );
  });

  it("should validate minimum length for secrets", () => {
    process.env.RPC_URL = "https://soroban-testnet.stellar.org";
    process.env.CONTRACT_ID = "test-contract-id";
    process.env.WEBHOOK_SECRET = "short"; // Less than 16 chars

    expect(() => {
      jest.isolateModules(() => {
        require("./config");
      });
    }).toThrow("process.exit called");

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("WEBHOOK_SECRET must be at least 16 characters")
    );
  });
});
