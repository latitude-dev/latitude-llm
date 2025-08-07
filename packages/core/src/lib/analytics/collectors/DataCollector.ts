import type { LatitudeEvent } from '../../../events/events'
import type { AnalyticsEnvironment, PostHogInstance } from '../types'

type OriginalOutput = Parameters<PostHogInstance['capture']>[0]

export type CollectorInput = {
  email: string
  user: { id: string; email: string } | undefined
  workspace: { id: number; uuid: string } | undefined
  event: LatitudeEvent
  analyticsEnv: AnalyticsEnvironment
}

export type ProductEdition = 'cloud' | 'oss'
export type CollectorOutput<E extends ProductEdition> = Omit<
  OriginalOutput,
  'properties' | 'disableGeoip'
> & {
  disableGeoip: true
  properties: OriginalOutput['properties'] & {
    workspaceId: number | undefined
    workspaceUuid: string | undefined
    appDomain: string
    productEdition: E
  }
}

export abstract class DataCollector<E extends ProductEdition> {
  abstract collect(args: CollectorInput): CollectorOutput<E> | undefined
}
