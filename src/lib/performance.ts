export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  metadata?: Record<string, any>;
  userId?: string;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 1000;

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public recordMetric(
    name: string,
    value: number,
    unit: string,
    metadata?: Record<string, any>,
    userId?: string
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date().toISOString(),
      metadata,
      userId,
    };

    this.metrics.push(metric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Send to external monitoring service
    if (process.env.NODE_ENV === 'production') {
      this.sendToExternalService(metric);
    }
  }

  private async sendToExternalService(metric: PerformanceMetric): Promise<void> {
    try {
      // Here you would integrate with services like PostHog, Sentry, or custom monitoring services
      if (process.env.POSTHOG_API_KEY) {
        // PostHog integration would go here
      }
      
      if (process.env.SENTRY_DSN) {
        // Sentry performance monitoring would go here
      }
    } catch (error) {
      console.error('Failed to send metric to external service:', error);
    }
  }

  public recordTiming(
    name: string,
    startTime: number,
    metadata?: Record<string, any>,
    userId?: string
  ): void {
    const duration = Date.now() - startTime;
    this.recordMetric(name, duration, 'ms', metadata, userId);
  }

  public recordApiCall(
    endpoint: string,
    duration: number,
    statusCode: number,
    method: string,
    userId?: string
  ): void {
    this.recordMetric(
      'api_call',
      duration,
      'ms',
      {
        endpoint,
        statusCode,
        method,
      },
      userId
    );
  }

  public recordDatabaseQuery(
    query: string,
    duration: number,
    operation: string,
    userId?: string
  ): void {
    this.recordMetric(
      'database_query',
      duration,
      'ms',
      {
        query: query.substring(0, 100), // Truncate long queries
        operation,
      },
      userId
    );
  }

  public recordSearch(
    query: string,
    duration: number,
    resultsCount: number,
    userId?: string
  ): void {
    this.recordMetric(
      'search',
      duration,
      'ms',
      {
        query: query.substring(0, 100), // Truncate long queries
        resultsCount,
      },
      userId
    );
  }

  public getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter(metric => metric.name === name);
  }

  public getMetricsByUser(userId: string): PerformanceMetric[] {
    return this.metrics.filter(metric => metric.userId === userId);
  }

  public getRecentMetrics(count: number = 100): PerformanceMetric[] {
    return this.metrics.slice(-count);
  }

  public getAverageMetric(name: string): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;
    
    const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
    return sum / metrics.length;
  }

  public getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    // Group metrics by name
    const grouped = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.name]) {
        acc[metric.name] = [];
      }
      acc[metric.name].push(metric.value);
      return acc;
    }, {} as Record<string, number[]>);

    // Calculate statistics for each metric
    Object.keys(grouped).forEach(name => {
      const values = grouped[name];
      const sum = values.reduce((acc, val) => acc + val, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      summary[name] = {
        count: values.length,
        average: avg,
        min,
        max,
        sum,
      };
    });

    return summary;
  }

  public clearMetrics(): void {
    this.metrics = [];
  }

  public exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2);
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Export convenience functions
export const recordTiming = (name: string, startTime: number, metadata?: Record<string, any>, userId?: string) => 
  performanceMonitor.recordTiming(name, startTime, metadata, userId);

export const recordApiCall = (endpoint: string, duration: number, statusCode: number, method: string, userId?: string) => 
  performanceMonitor.recordApiCall(endpoint, duration, statusCode, method, userId);

export const recordDatabaseQuery = (query: string, duration: number, operation: string, userId?: string) => 
  performanceMonitor.recordDatabaseQuery(query, duration, operation, userId);

export const recordSearch = (query: string, duration: number, resultsCount: number, userId?: string) => 
  performanceMonitor.recordSearch(query, duration, resultsCount, userId);