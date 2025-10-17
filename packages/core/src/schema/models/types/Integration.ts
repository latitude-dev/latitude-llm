import { type InferSelectModel } from 'drizzle-orm'
import { IntegrationConfiguration } from '../../../services/integrations/helpers/schema'
import { IntegrationType } from '@latitude-data/constants'

import { integrations } from '../integrations'

export type Integration = InferSelectModel<typeof integrations>
export type IntegrationDto = Omit<Integration, 'configuration' | 'type'> &
  IntegrationConfiguration
export type PipedreamIntegration = Extract<
  IntegrationDto,
  { type: IntegrationType.Pipedream }
>
export type PipedreamIntegrationWithAcountCount = PipedreamIntegration & {
  accountCount: number
}
export type PipedreamIntegrationWithCounts =
  PipedreamIntegrationWithAcountCount & {
    triggerCount: number
  }
