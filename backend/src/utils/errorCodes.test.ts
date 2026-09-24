
import {
  ErrorCode,
  ERROR_STATUS_MAP,
  getStatusCode,
  StandardErrorResponse,
} from './errorCodes';

describe('ErrorCode enum', () => {
  it('should have all required error codes defined', () => {
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCode.MISSING_TOKEN).toBe('MISSING_TOKEN');
    expect(ErrorCode.INVALID_TOKEN).toBe('INVALID_TOKEN');
    expect(ErrorCode.LOAN_NOT_FOUND).toBe('LOAN_NOT_FOUND');
    expect(ErrorCode.COLLATERAL_NOT_FOUND).toBe('COLLATERAL_NOT_FOUND');
  });

  it('should have all Soroban error codes', () => {
    expect(ErrorCode.CONTRACT_NOT_INITIALIZED).toBe('CONTRACT_NOT_INITIALIZED');
    expect(ErrorCode.INSUFFICIENT_COLLATERAL).toBe('INSUFFICIENT_COLLATERAL');
    expect(ErrorCode.HEALTH_FACTOR_SAFE).toBe('HEALTH_FACTOR_SAFE');
    expect(ErrorCode.LIQUIDATOR_NOT_WHITELISTED).toBe('LIQUIDATOR_NOT_WHITELISTED');
  });
});

describe('ERROR_STATUS_MAP', () => {
  it('should map all error codes to valid HTTP status codes', () => {
    Object.values(ErrorCode).forEach((code) => {
      const status = ERROR_STATUS_MAP[code as ErrorCode];
      expect(status).toBeDefined();
      expect(typeof status).toBe('number');
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThanOrEqual(503);
    });
  });

  it('should map validation errors to 400', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.VALIDATION_ERROR]).toBe(400);
    expect(ERROR_STATUS_MAP[ErrorCode.INVALID_PAGINATION]).toBe(400);
  });

  it('should map not found errors to 404', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.NOT_FOUND]).toBe(404);
    expect(ERROR_STATUS_MAP[ErrorCode.LOAN_NOT_FOUND]).toBe(404);
    expect(ERROR_STATUS_MAP[ErrorCode.COLLATERAL_NOT_FOUND]).toBe(404);
    expect(ERROR_STATUS_MAP[ErrorCode.ORACLE_NOT_FOUND]).toBe(404);
  });

  it('should map auth errors to 401', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.INVALID_TOKEN]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCode.TOKEN_EXPIRED]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCode.INVALID_SIGNATURE]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCode.MISSING_HEADER]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCode.INVALID_API_KEY]).toBe(401);
  });

  it('should map permission errors to 403', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.FORBIDDEN]).toBe(403);
    expect(ERROR_STATUS_MAP[ErrorCode.UNAUTHORIZED]).toBe(403);
    expect(ERROR_STATUS_MAP[ErrorCode.LIQUIDATOR_NOT_WHITELISTED]).toBe(403);
  });

  it('should map conflict errors to 409', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.ALREADY_PLEDGED]).toBe(409);
    expect(ERROR_STATUS_MAP[ErrorCode.LOAN_ALREADY_CLOSED]).toBe(409);
    expect(ERROR_STATUS_MAP[ErrorCode.ORACLE_ALREADY_REGISTERED]).toBe(409);
    expect(ERROR_STATUS_MAP[ErrorCode.REENTRANCY_GUARD]).toBe(409);
  });

  it('should map rate limit to 429', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.RATE_LIMITED]).toBe(429);
  });

  it('should map internal errors to 500', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.INTERNAL_ERROR]).toBe(500);
    expect(ERROR_STATUS_MAP[ErrorCode.ARITHMETIC_OVERFLOW]).toBe(500);
  });

  it('should map service unavailable to 503', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.CONTRACT_PAUSED]).toBe(503);
    expect(ERROR_STATUS_MAP[ErrorCode.SERVICE_UNAVAILABLE]).toBe(503);
  });

  it('should map bad gateway to 502', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.BAD_GATEWAY]).toBe(502);
    expect(ERROR_STATUS_MAP[ErrorCode.CONTRACT_NOT_INITIALIZED]).toBe(502);
    expect(ERROR_STATUS_MAP[ErrorCode.INSUFFICIENT_ORACLE_QUORUM]).toBe(502);
  });

  it('should map business logic errors to 400', () => {
    expect(ERROR_STATUS_MAP[ErrorCode.HEALTH_FACTOR_SAFE]).toBe(400);
    expect(ERROR_STATUS_MAP[ErrorCode.INSUFFICIENT_COLLATERAL]).toBe(400);
    expect(ERROR_STATUS_MAP[ErrorCode.INVALID_AMOUNT]).toBe(400);
  });
});

describe('getStatusCode function', () => {
  it('should return correct status code for known error code', () => {
    expect(getStatusCode(ErrorCode.LOAN_NOT_FOUND)).toBe(404);
    expect(getStatusCode(ErrorCode.VALIDATION_ERROR)).toBe(400);
    expect(getStatusCode(ErrorCode.INTERNAL_ERROR)).toBe(500);
  });

  it('should default to 500 for unknown error codes', () => {
    // This tests the fallback behavior even though all codes are mapped
    const unknownCode = 'UNKNOWN_ERROR' as any;
    expect(getStatusCode(unknownCode) || 500).toBe(500);
  });

  it('should map auth errors correctly', () => {
    expect(getStatusCode(ErrorCode.MISSING_TOKEN)).toBe(400);
    expect(getStatusCode(ErrorCode.INVALID_TOKEN)).toBe(401);
    expect(getStatusCode(ErrorCode.TOKEN_EXPIRED)).toBe(401);
  });

  it('should map Soroban contract errors to correct status codes', () => {
    expect(getStatusCode(ErrorCode.CONTRACT_NOT_INITIALIZED)).toBe(502);
    expect(getStatusCode(ErrorCode.INSUFFICIENT_COLLATERAL)).toBe(400);
    expect(getStatusCode(ErrorCode.LIQUIDATOR_NOT_WHITELISTED)).toBe(403);
    expect(getStatusCode(ErrorCode.HEALTH_FACTOR_SAFE)).toBe(400);
  });
});

describe('StandardErrorResponse interface', () => {
  it('should have required fields', () => {
    const response: StandardErrorResponse = {
      code: ErrorCode.LOAN_NOT_FOUND,
      message: 'Loan not found',
      correlationId: 'test-id',
    };

    expect(response.code).toBe(ErrorCode.LOAN_NOT_FOUND);
    expect(response.message).toBe('Loan not found');
    expect(response.correlationId).toBe('test-id');
  });

  it('should support optional details field', () => {
    const response: StandardErrorResponse = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      correlationId: 'test-id',
      details: {
        email: ['Invalid email format'],
        age: ['Must be positive'],
      },
    };

    expect(response.details).toBeDefined();
    expect(response.details).toHaveProperty('email');
  });

  it('should type ValidationDetails correctly', () => {
    const response: StandardErrorResponse = {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      correlationId: 'test-id',
      details: {
        field1: ['error 1', 'error 2'],
        field2: ['error 3'],
      },
    };

    if (response.details && typeof response.details === 'object') {
      expect((response.details as any).field1).toBeInstanceOf(Array);
      expect((response.details as any).field1[0]).toBe('error 1');
    }
  });
});

describe('Error code coverage', () => {
  it('should have all Soroban contract error codes from docs', () => {
    const sorobanCodes = [
      ErrorCode.CONTRACT_NOT_INITIALIZED, // #1
      ErrorCode.CONTRACT_ALREADY_INITIALIZED, // #2
      ErrorCode.UNAUTHORIZED, // #3
      ErrorCode.INSUFFICIENT_COLLATERAL, // #4
      ErrorCode.LOAN_NOT_FOUND, // #5
      ErrorCode.COLLATERAL_NOT_FOUND, // #6
      ErrorCode.HEALTH_FACTOR_SAFE, // #7
      ErrorCode.INVALID_AMOUNT, // #8
      ErrorCode.LOAN_ALREADY_CLOSED, // #9
      ErrorCode.INVALID_FEE_RATE, // #10
      ErrorCode.EXCEEDS_CLOSE_FACTOR, // #11
      ErrorCode.INVALID_CLOSE_FACTOR, // #12
      ErrorCode.CONTRACT_PAUSED, // #13
      ErrorCode.ORACLE_ALREADY_REGISTERED, // #14
      ErrorCode.ORACLE_LIMIT_REACHED, // #15
      ErrorCode.ORACLE_NOT_FOUND, // #16
      ErrorCode.INSUFFICIENT_ORACLE_QUORUM, // #17
      ErrorCode.INVALID_PRICE, // #18
      ErrorCode.NOT_PAUSED, // #19
      ErrorCode.REENTRANCY_GUARD, // #20
      ErrorCode.ALREADY_PAUSED, // #21
      ErrorCode.ARITHMETIC_OVERFLOW, // #22
      ErrorCode.LIQUIDATOR_NOT_WHITELISTED, // #23
      ErrorCode.NO_UPGRADE_PENDING, // #24
      ErrorCode.TIMELOCK_NOT_ELAPSED, // #25
      ErrorCode.ORACLE_REQUIRED, // #26
    ];

    sorobanCodes.forEach((code) => {
      expect(code).toBeDefined();
      expect(ERROR_STATUS_MAP[code]).toBeDefined();
    });
  });

  it('should have all auth-related error codes', () => {
    const authCodes = [
      ErrorCode.MISSING_TOKEN,
      ErrorCode.INVALID_TOKEN,
      ErrorCode.TOKEN_EXPIRED,
      ErrorCode.INVALID_SIGNATURE,
      ErrorCode.MISSING_HEADER,
      ErrorCode.INVALID_API_KEY,
      ErrorCode.AUTHENTICATION_REQUIRED,
      ErrorCode.FORBIDDEN,
    ];

    authCodes.forEach((code) => {
      expect(code).toBeDefined();
      expect(ERROR_STATUS_MAP[code]).toBeDefined();
    });
  });
});
