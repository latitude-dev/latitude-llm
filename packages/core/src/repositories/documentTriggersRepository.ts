import { eq, getTableColumns } from 'drizzle-orm'

import { DocumentTrigger } from '../browser'
import { documentTriggers } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(documentTriggers)

export class DocumentTriggersRepository extends Repository<DocumentTrigger> {
  get scopeFilter() {
    return eq(documentTriggers.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentTriggers)
      .where(this.scopeFilter)
      .$dynamic()
  }

  findByScopedDocumentUuid(documentUuid: string): Promise<DocumentTrigger[]> {
    return this.scope
      .where(eq(documentTriggers.documentUuid, documentUuid))
      .execute() as Promise<DocumentTrigger[]>
  }
}
