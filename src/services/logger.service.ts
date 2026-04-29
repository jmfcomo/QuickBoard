import { Injectable } from '@angular/core';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private logLevel = LogLevel.DEBUG;
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  debug(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  error(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.ERROR, message, context, data);
  }

  private log(level: LogLevel, message: string, context?: string, data?: unknown): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      data,
    };

    this.logs.push(entry);

    // Keep logs bounded
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Also log to console for development
    this.logToConsole(entry);
  }

  private logToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const prefix = `[${entry.timestamp.toISOString()}] [${levelName}]`;
    const context = entry.context ? ` [${entry.context}]` : '';

    if (entry.data !== undefined) {
      console[this.getConsoleMethod(entry.level)](
        `${prefix}${context} ${entry.message}`,
        entry.data
      );
    } else {
      console[this.getConsoleMethod(entry.level)](`${prefix}${context} ${entry.message}`);
    }
  }

  private getConsoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
    switch (level) {
      case LogLevel.DEBUG:
        return 'log';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
        return 'error';
    }
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level === undefined) {
      return [...this.logs];
    }
    return this.logs.filter((log) => log.level >= level);
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return this.logs
      .map(
        (log) =>
          `${log.timestamp.toISOString()} [${LogLevel[log.level]}] ${
            log.context ? `[${log.context}]` : ''
          } ${log.message} ${log.data ? JSON.stringify(log.data) : ''}`
      )
      .join('\n');
  }
}
