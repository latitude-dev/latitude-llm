import { CollectorOutput, ProductEdition } from '../collectors/DataCollector'

export interface AnalyticsProvider {
  capture(data: CollectorOutput<ProductEdition>): Promise<void>
}
