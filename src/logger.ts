import pino, { Logger } from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

const logger: Logger = pino({
  level: "info",
  transport: isDevelopment ? {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
      messageFormat: "{name} - {msg}",
      singleLine: false,
      hideObject: false
    }
  } : undefined
});

export function createLogger(name: string): Logger {
  return logger.child({ name });
}

export default logger; 