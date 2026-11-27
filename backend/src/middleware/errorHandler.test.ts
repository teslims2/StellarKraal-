
import { Request, Response, NextFunction } from 'express';
import { AppError, errorHandler } from './errorHandler';
import { ErrorCode } from '../utils/errorCodes';

/** Build a minimal Express res mock that records status codes and JSON bodies. */
function buildMockRes() {
  const statusCalls: number[] = [];
  const jsonCalls: unknown[] = [];

  const res: Partial<Response> = {} as any;

  (res as any).status = (code: number) => {
    statusCalls.push(code);
    return res;
  };
  (res as any).json = (body: unknown) => {
    jsonCalls.push(body);
    return res;
  };

  return { res, statusCalls, jsonCalls };
}

describe('errorHandler middleware', () => {
  const mockReqBase = { method: 'POST', path: '/api/v1/loans' } as Partial<Request>;
  const mockNext: NextFunction = () => {};

  it('should format AppError with standard response format', () => {
    const error = new AppError(ErrorCode.LOAN_NOT_FOUND, 'Loan 123 not found');
    const req = { ...mockReqBase, requestId: 'test-correlation-id' } as any;
    const { res, jsonCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(jsonCalls).toHaveLength(1);
    expect(jsonCalls[0]).toEqual({
      error: {
        code: ErrorCode.LOAN_NOT_FOUND,
        message: 'Loan 123 not found',
        correlationId: 'test-correlation-id',
      },
    });
  });

  it('should include details when provided', () => {
    const details = { healthFactor: 8500 };
    const error = new AppError(ErrorCode.HEALTH_FACTOR_SAFE, 'Loan is not liquidatable', details);
    const req = { ...mockReqBase, requestId: 'test-id' } as any;
    const { res, jsonCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect((jsonCalls[0] as any).error.details).toEqual(details);
  });

  it('should set correct HTTP status code', () => {
    const error = new AppError(ErrorCode.LOAN_NOT_FOUND, 'Loan not found');
    const req = { ...mockReqBase, requestId: 'test-id' } as any;
    const { res, statusCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(statusCalls).toContain(404);
  });

  it('should default to 500 for non-AppError errors', () => {
    const error = new Error('Generic error');
    const req = { ...mockReqBase, requestId: 'test-id' } as any;
    const { res, statusCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(statusCalls).toContain(500);
  });

  it('should use requestId from request or default to "unknown"', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');
    const req = { method: 'GET', path: '/api/v1/health' } as any; // no requestId
    const { res, jsonCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect((jsonCalls[0] as any).error.correlationId).toBe('unknown');
  });

  it('should exclude stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');
    error.stack = 'Error: Server error\n  at test.ts:1:1';
    const req = { ...mockReqBase, requestId: 'test-id' } as any;
    const { res, jsonCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(jsonCalls[0]).not.toHaveProperty('stack');

    process.env.NODE_ENV = originalEnv;
  });

  it('should include stack trace in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');
    error.stack = 'Error: Server error\n  at test.ts:1:1';
    const req = { ...mockReqBase, requestId: 'test-id' } as any;
    const { res, jsonCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(jsonCalls[0]).toHaveProperty('stack');
    expect((jsonCalls[0] as any).stack).toContain('Error: Server error');

    process.env.NODE_ENV = originalEnv;
  });

  it('should map VALIDATION_ERROR to 400', () => {
    const error = new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid input', { field: ['error message'] });
    const req = { ...mockReqBase } as any;
    const { res, statusCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(statusCalls).toContain(400);
  });

  it('should map FORBIDDEN to 403', () => {
    const error = new AppError(ErrorCode.FORBIDDEN, 'You do not have permission');
    const req = { ...mockReqBase } as any;
    const { res, statusCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(statusCalls).toContain(403);
  });

  it('should map CONTRACT_PAUSED to 503', () => {
    const error = new AppError(ErrorCode.CONTRACT_PAUSED, 'Contract is paused');
    const req = { ...mockReqBase } as any;
    const { res, statusCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(statusCalls).toContain(503);
  });

  it('should map RATE_LIMITED to 429', () => {
    const error = new AppError(ErrorCode.RATE_LIMITED, 'Too many requests');
    const req = { ...mockReqBase } as any;
    const { res, statusCalls } = buildMockRes();

    errorHandler(error, req, res as Response, mockNext);

    expect(statusCalls).toContain(429);
  });
});

describe('AppError class', () => {
  it('should create AppError with code and message', () => {
    const error = new AppError(ErrorCode.LOAN_NOT_FOUND, 'Loan not found');
    expect(error.code).toBe(ErrorCode.LOAN_NOT_FOUND);
    expect(error.message).toBe('Loan not found');
    expect(error.name).toBe('AppError');
  });

  it('should create AppError with details', () => {
    const details = { loanId: 123 };
    const error = new AppError(ErrorCode.LOAN_NOT_FOUND, 'Loan not found', details);
    expect(error.details).toEqual(details);
  });

  it('should get correct statusCode from code', () => {
    expect(new AppError(ErrorCode.LOAN_NOT_FOUND, 'Not found').statusCode).toBe(404);
    expect(new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid').statusCode).toBe(400);
    expect(new AppError(ErrorCode.INTERNAL_ERROR, 'Internal server error').statusCode).toBe(500);
  });

  it('should extend Error properly', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Test error');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof AppError).toBe(true);
  });
});
