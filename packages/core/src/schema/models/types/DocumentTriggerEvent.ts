import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTriggerEventPayload } from '@latitude-data/constants/documentTriggers'
import { type InferSelectModel } from 'drizzle-orm'

import { documentTriggerEvents } from '../documentTriggerEvents'

export type DocumentTriggerEvent<
  T extends DocumentTriggerType = DocumentTriggerType,
> = InferSelectModel<typeof documentTriggerEvents> & {
  triggerType: T
  payload: DocumentTriggerEventPayload<T>
}
