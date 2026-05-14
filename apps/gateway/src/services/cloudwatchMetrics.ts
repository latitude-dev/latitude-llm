import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch'
import { env } from '@latitude-data/env'
import { captureException } from '../common/tracer'

class CloudWatchMetricsService {
  private client: CloudWatchClient | null = null
  private inflightRequests = 0
  private namespace = 'Latitude/Gateway'
  private metricName = 'inflight_per_task'
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor() {
    if (this.isConfigured()) {
      this.client = new CloudWatchClient({
        region: env.AWS_REGION || 'us-east-1',
      })
    }
  }

  private isConfigured(): boolean {
    return env.NODE_ENV === 'production'
  }

  incrementInflightRequests(): void {
    this.inflightRequests++
  }

  decrementInflightRequests(): void {
    this.inflightRequests = Math.max(0, this.inflightRequests - 1)
  }

  getInflightRequests(): number {
    return this.inflightRequests
  }

  async emitMetric(): Promise<void> {
    if (!this.isConfigured() || !this.client) {
      return
    }

    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: this.metricName,
            Value: this.inflightRequests,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })

      await this.client.send(command)
    } catch (error) {
      captureException(error as Error)
    }
  }

  startPeriodicEmission(intervalMs = 10000): boolean {
    if (!this.isConfigured() || this.intervalId) {
      return false
    }

    this.intervalId = setInterval(() => {
      this.emitMetric()
    }, intervalMs)

    this.intervalId.unref()

    return true
  }

  stopPeriodicEmission(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

export const cloudWatchMetrics = new CloudWatchMetricsService()
