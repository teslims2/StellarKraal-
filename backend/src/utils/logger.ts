import winston from "winston";
import { config } from "../config";

const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format:
    config.NODE_ENV === "production"
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      : winston.format.combine(
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          winston.format.errors({ stack: true }),
          winston.format.colorize(),
          winston.format.printf(
            ({ timestamp, level, message, ...meta }) =>
              `${timestamp} [${level}]: ${message} ${
                Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
              }`
          )
        ),
  transports: [new winston.transports.Console()],
});

/**
 * Create a child logger with additional context (e.g., request ID)
 */
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

export default logger;
