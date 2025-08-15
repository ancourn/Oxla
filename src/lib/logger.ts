export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  userId?: string;
  requestId?: string;
}

class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private readonly maxLogs = 1000;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    userId?: string,
    requestId?: string
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      userId,
      requestId,
    };
  }

  private log(entry: LogEntry): void {
    // Add to in-memory logs
    this.logs.push(entry);
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      const levelName = LogLevel[entry.level];
      const prefix = `[${entry.timestamp}] [${levelName}]`;
      const userPrefix = entry.userId ? ` [User: ${entry.userId}]` : '';
      const requestPrefix = entry.requestId ? ` [Request: ${entry.requestId}]` : '';
      
      console.log(`${prefix}${userPrefix}${requestPrefix} ${entry.message}`);
      
      if (entry.metadata) {
        console.log('Metadata:', entry.metadata);
      }
    }

    // Send to Sentry for errors
    if (entry.level === LogLevel.ERROR) {
      this.sendToSentry(entry);
    }

    // Send to external logging service in production
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(entry);
    }
  }

  private sendToSentry(entry: LogEntry): void {
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(new Error(entry.message), {
        extra: entry.metadata,
        tags: {
          userId: entry.userId,
          requestId: entry.requestId,
        },
      });
    }
  }

  private async sendToExternalService(entry: LogEntry): Promise<void> {
    try {
      // Here you would integrate with services like LogRocket, PostHog, or custom logging services
      // For now, we'll just simulate it
      if (process.env.LOGROCKET_APP_ID) {
        // LogRocket integration would go here
      }
      
      if (process.env.POSTHOG_API_KEY) {
        // PostHog integration would go here
      }
    } catch (error) {
      console.error('Failed to send log to external service:', error);
    }
  }

  public debug(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(this.createLogEntry(LogLevel.DEBUG, message, metadata, userId, requestId));
  }

  public info(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(this.createLogEntry(LogLevel.INFO, message, metadata, userId, requestId));
  }

  public warn(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(this.createLogEntry(LogLevel.WARN, message, metadata, userId, requestId));
  }

  public error(message: string, metadata?: Record<string, any>, userId?: string, requestId?: string): void {
    this.log(this.createLogEntry(LogLevel.ERROR, message, metadata, userId, requestId));
  }

  public getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  public getLogsByUser(userId: string): LogEntry[] {
    return this.logs.filter(log => log.userId === userId);
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const logDebug = (message: string, metadata?: Record<string, any>, userId?: string, requestId?: string) => 
  logger.debug(message, metadata, userId, requestId);

export const logInfo = (message: string, metadata?: Record<string, any>, userId?: string, requestId?: string) => 
  logger.info(message, metadata, userId, requestId);

export const logWarn = (message: string, metadata?: Record<string, any>, userId?: string, requestId?: string) => 
  logger.warn(message, metadata, userId, requestId);

export const logError = (message: string, metadata?: Record<string, any>, userId?: string, requestId?: string) => 
  logger.error(message, metadata, userId, requestId);