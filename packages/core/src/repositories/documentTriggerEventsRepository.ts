import { and, desc, eq, getTableColumns } from 'drizzle-orm'
import { type DocumentTriggerEvent } from '../schema/models/types/DocumentTriggerEvent'
import { type DocumentTrigger } from '../schema/models/types/DocumentTrigger'
import { documentTriggerEvents } from '../schema/models/documentTriggerEvents'
import Repository from './repositoryV2'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import { LatitudeError } from '@latitude-data/constants/errors'

const tt = getTableColumns(documentTriggerEvents)

export class DocumentTriggerEventsRepository extends Repository<DocumentTriggerEvent> {
  get scopeFilter() {
    return eq(documentTriggerEvents.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentTriggerEvents)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByTrigger(
    trigger: DocumentTrigger,
    limit?: number,
  ): PromisedResult<DocumentTriggerEvent[], LatitudeError> {
    let query = this.db
      .select(tt)
      .from(documentTriggerEvents)
      .where(
        and(
          this.scopeFilter,
          eq(documentTriggerEvents.triggerUuid, trigger.uuid),
          eq(documentTriggerEvents.triggerHash, trigger.triggerHash),
        ),
      )
      .$dynamic()

    if (limit) {
      query = query.limit(limit)
    }

    const results = await query.orderBy(desc(documentTriggerEvents.id))
    return Result.ok(results as DocumentTriggerEvent[])
  }
}
