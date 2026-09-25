
import { Request, Response, NextFunction } from 'express';
import { AppError, errorHandler } from './errorHandler';
import { ErrorCode } from '../utils/errorCodes';

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: any;
  let statusSpy: any;

  beforeEach(() => {
    jsonSpy = { json: (body: unknown) => mockRes };
    statusSpy = { status: (code: number) => jsonSpy };
    mockRes = statusSpy;
    mockReq = {
      method: 'POST',
      path: '/api/v1/loans',
    } as any;
    mockNext = () => {};
  });

  it('should format AppError with standard response format', () => {
    const error = new AppError(
      ErrorCode.LOAN_NOT_FOUND,
      'Loan 123 not found'
    );

    (mockReq as any).requestId = 'test-correlation-id';

    const jsonCalls: any[] = [];
    (mockRes as any).json = (body: unknown) => {
      jsonCalls.push(body);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(jsonCalls).toHaveLength(1);
    const response = jsonCalls[0];
    expect(response).toEqual({
      code: ErrorCode.LOAN_NOT_FOUND,
      message: 'Loan 123 not found',
      correlationId: 'test-correlation-id',
    });
  });

  it('should include details when provided', () => {
    const details = { healthFactor: 8500 };
    const error = new AppError(
      ErrorCode.HEALTH_FACTOR_SAFE,
      'Loan is not liquidatable',
      details
    );

    (mockReq as any).requestId = 'test-id';

    const jsonCalls: any[] = [];
    (mockRes as any).json = (body: unknown) => {
      jsonCalls.push(body);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    const response = jsonCalls[0];
    expect(response.details).toEqual(details);
  });

  it('should set correct HTTP status code', () => {
    const error = new AppError(
      ErrorCode.LOAN_NOT_FOUND,
      'Loan not found'
    );

    (mockReq as any).requestId = 'test-id';

    const statusCalls: number[] = [];
    (mockRes as any).status = (code: number) => {
      statusCalls.push(code);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusCalls).toContain(404);
  });

  it('should default to 500 for non-AppError errors', () => {
    const error = new Error('Generic error');

    (mockReq as any).requestId = 'test-id';

    const statusCalls: number[] = [];
    (mockRes as any).status = (code: number) => {
      statusCalls.push(code);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusCalls).toContain(500);
  });

  it('should use requestId from request or default to "unknown"', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');

    mockReq = { method: 'GET', path: '/api/v1/health' } as any; // no requestId

    const jsonCalls: any[] = [];
    (mockRes as any).json = (body: unknown) => {
      jsonCalls.push(body);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    const response = jsonCalls[0];
    expect(response.correlationId).toBe('unknown');
  });

  it('should exclude stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');
    error.stack = 'Error: Server error\n  at test.ts:1:1';

    (mockReq as any).requestId = 'test-id';

    const jsonCalls: any[] = [];
    (mockRes as any).json = (body: unknown) => {
      jsonCalls.push(body);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    const response = jsonCalls[0];
    expect(response).not.toHaveProperty('stack');

    process.env.NODE_ENV = originalEnv;
  });

  it('should include stack trace in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Server error');
    error.stack = 'Error: Server error\n  at test.ts:1:1';

    (mockReq as any).requestId = 'test-id';

    const jsonCalls: any[] = [];
    (mockRes as any).json = (body: unknown) => {
      jsonCalls.push(body);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    const response = jsonCalls[0];
    expect(response).toHaveProperty('stack');
    expect((response as any).stack).toContain('Error: Server error');

    process.env.NODE_ENV = originalEnv;
  });

  it('should map VALIDATION_ERROR to 400', () => {
    const error = new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid input',
      { details: { field: ['error message'] } }
    );

    const statusCalls: number[] = [];
    (mockRes as any).status = (code: number) => {
      statusCalls.push(code);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusCalls).toContain(400);
  });

  it('should map FORBIDDEN to 403', () => {
    const error = new AppError(
      ErrorCode.FORBIDDEN,
      'You do not have permission'
    );

    const statusCalls: number[] = [];
    (mockRes as any).status = (code: number) => {
      statusCalls.push(code);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusCalls).toContain(403);
  });

  it('should map CONTRACT_PAUSED to 503', () => {
    const error = new AppError(
      ErrorCode.CONTRACT_PAUSED,
      'Contract is paused'
    );

    const statusCalls: number[] = [];
    (mockRes as any).status = (code: number) => {
      statusCalls.push(code);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusCalls).toContain(503);
  });

  it('should map RATE_LIMITED to 429', () => {
    const error = new AppError(
      ErrorCode.RATE_LIMITED,
      'Too many requests'
    );

    const statusCalls: number[] = [];
    (mockRes as any).status = (code: number) => {
      statusCalls.push(code);
      return mockRes;
    };

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

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
    const error = new AppError(
      ErrorCode.LOAN_NOT_FOUND,
      'Loan not found',
      details
    );
    expect(error.details).toEqual(details);
  });

  it('should get correct statusCode from code', () => {
    const notFoundError = new AppError(
      ErrorCode.LOAN_NOT_FOUND,
      'Not found'
    );
    expect(notFoundError.statusCode).toBe(404);

    const validationError = new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Invalid'
    );
    expect(validationError.statusCode).toBe(400);

    const internalError = new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Internal server error'
    );
    expect(internalError.statusCode).toBe(500);
  });

  it('should extend Error properly', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Test error');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof AppError).toBe(true);
  });
});
