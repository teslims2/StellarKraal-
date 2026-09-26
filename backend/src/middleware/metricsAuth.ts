import { Request, Response, NextFunction } from "express";

export function metricsAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return next();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized: valid bearer token required for /metrics" });
  }
  next();
}
