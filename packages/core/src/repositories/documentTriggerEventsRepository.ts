import { eq, getTableColumns } from 'drizzle-orm'
import { DocumentTriggerEvent } from '../browser'
import { documentTriggerEvents } from '../schema'
import Repository from './repositoryV2'

export class DocumentTriggerEventsRepository extends Repository<DocumentTriggerEvent> {
  get scopeFilter() {
    return eq(documentTriggerEvents.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(getTableColumns(documentTriggerEvents))
      .from(documentTriggerEvents)
      .where(this.scopeFilter)
      .$dynamic()
  }
}
