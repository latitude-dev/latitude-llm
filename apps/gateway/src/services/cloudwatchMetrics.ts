import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch'
import { env } from '@latitude-data/env'

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
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY!,
          secretAccessKey: env.AWS_ACCESS_SECRET!,
        },
      })
    }
  }

  private isConfigured(): boolean {
    return Boolean(
      env.NODE_ENV === 'production' &&
        env.AWS_ACCESS_KEY &&
        env.AWS_ACCESS_SECRET,
    )
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
      console.error('Failed to emit CloudWatch metric:', error)
    }
  }

  startPeriodicEmission(intervalMs = 10000): void {
    if (!this.isConfigured() || this.intervalId) {
      return
    }

    this.intervalId = setInterval(() => {
      this.emitMetric()
    }, intervalMs)

    this.intervalId.unref()
  }

  stopPeriodicEmission(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}

export const cloudWatchMetrics = new CloudWatchMetricsService()
