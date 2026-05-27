import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = 'logs';

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const shareLogTransport = new DailyRotateFile({
  filename: path.join(logDir, 'shares-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: fileFormat
});

const errorLogTransport = new DailyRotateFile({
  filename: path.join(logDir, 'errors-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: fileFormat
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fileFormat,
  transports: [
    shareLogTransport,
    errorLogTransport,
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    })
  ]
});

export class ShareLogger {
  private shareId: string;

  constructor(shareId: string) {
    this.shareId = shareId;
  }

  info(message: string, meta?: any) {
    logger.info(message, { shareId: this.shareId, ...meta });
  }

  error(message: string, meta?: any) {
    logger.error(message, { shareId: this.shareId, ...meta });
  }

  warning(message: string, meta?: any) {
    logger.warn(message, { shareId: this.shareId, ...meta });
  }
}

export default logger;