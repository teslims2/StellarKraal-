import helmet from 'helmet';
import type { RequestHandler } from 'express';
import { config } from '../config';

/**
 * Helmet middleware pre-configured with strict security headers.
 *
 * - Content-Security-Policy: allows only same-origin scripts (default-src 'self')
 * - Strict-Transport-Security: max-age=31536000 (1 year, production only)
 * - X-Frame-Options: DENY
 * - Plus other helmet defaults (XSS protection, noSniff, etc.)
 */
const isProduction = config.NODE_ENV === 'production';
const secureHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'"],
    },
  },
  hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

export const helmetMiddleware: RequestHandler = (req, res, next) => {
  secureHeaders(req, res, (error) => {
    if (error) return next(error);
    res.removeHeader('Server');
    res.removeHeader('X-Powered-By');
    next();
  });
};
