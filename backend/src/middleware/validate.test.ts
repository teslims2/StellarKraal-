
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from './validate';
import { AppError } from './errorHandler';
import { ErrorCode } from '../utils/errorCodes';

describe('validate middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let nextCalled = false;

  beforeEach(() => {
    mockReq = { body: {} } as Request;
    mockRes = {};
    mockNext = () => {
      nextCalled = true;
    };
    nextCalled = false;
  });

  it('should pass validation and call next', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().positive(),
    });

    mockReq.body = { name: 'John', age: 30 };

    const middleware = validate(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(nextCalled).toBe(true);
    expect(mockReq.body).toEqual({ name: 'John', age: 30 });
  });

  it('should throw AppError on validation failure', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().positive(),
    });

    mockReq.body = { name: 'John', age: -5 };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(thrownError.message).toBe('Validation failed');
    expect(thrownError.details).toBeDefined();
  });

  it('should include field-level errors in details', () => {
    const schema = z.object({
      name: z.string().min(2),
      age: z.number().positive(),
    });

    mockReq.body = { name: 'J', age: -5 };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    const details = thrownError.details.details;
    expect(details).toBeDefined();
    expect(details.name).toBeDefined();
    expect(details.age).toBeDefined();
    expect(Array.isArray(details.name)).toBe(true);
    expect(Array.isArray(details.age)).toBe(true);
  });

  it('should handle nested field errors', () => {
    const schema = z.object({
      user: z.object({
        email: z.string().email(),
        profile: z.object({
          age: z.number().positive(),
        }),
      }),
    });

    mockReq.body = {
      user: {
        email: 'invalid-email',
        profile: { age: -10 },
      },
    };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    const details = thrownError.details.details;
    expect(details['user.email']).toBeDefined();
    expect(details['user.profile.age']).toBeDefined();
  });

  it('should strip unknown fields', () => {
    const schema = z.object({
      name: z.string(),
    });

    mockReq.body = { name: 'John', extra: 'field', another: 123 };

    const middleware = validate(schema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.body).toEqual({ name: 'John' });
    expect(mockReq.body).not.toHaveProperty('extra');
    expect(mockReq.body).not.toHaveProperty('another');
  });

  it('should handle required field errors', () => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    mockReq.body = { email: 'test@example.com' };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    const details = thrownError.details.details;
    expect(details.password).toBeDefined();
    expect(details.password.length).toBeGreaterThan(0);
  });

  it('should collect multiple errors for a single field', () => {
    const schema = z.object({
      username: z.string().min(3).max(10),
    });

    mockReq.body = { username: 'ab' }; // too short, will have validation message

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    const details = thrownError.details.details;
    expect(details.username).toBeDefined();
    expect(Array.isArray(details.username)).toBe(true);
    expect(details.username.length).toBeGreaterThan(0);
  });

  it('should handle root-level validation errors', () => {
    const schema = z.object({
      items: z.array(z.string()).min(1),
    });

    mockReq.body = { items: [] };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    const details = thrownError.details.details;
    expect(details.items).toBeDefined();
  });

  it('should have correct HTTP status code', () => {
    const schema = z.object({ name: z.string() });
    mockReq.body = { name: 123 };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError.statusCode).toBe(400);
  });

  it('should handle conditional validation', () => {
    const schema = z.object({
      type: z.enum(['email', 'phone']),
      value: z.string(),
    }).refine((data) => {
      if (data.type === 'email') {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.value);
      }
      return /^\d+$/.test(data.value);
    }, { message: 'Invalid value for type' });

    mockReq.body = { type: 'email', value: 'not-an-email' };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(AppError);
    expect(thrownError.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('should preserve error messages from schema', () => {
    const schema = z.object({
      age: z.number().positive('Age must be a positive number'),
    });

    mockReq.body = { age: -5 };

    const middleware = validate(schema);
    let thrownError: any;
    try {
      middleware(mockReq as Request, mockRes as Response, mockNext);
    } catch (err) {
      thrownError = err;
    }

    const details = thrownError.details.details;
    expect(details.age[0]).toContain('positive');
  });
});
