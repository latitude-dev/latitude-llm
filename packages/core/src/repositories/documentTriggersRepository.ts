import { and, eq, getTableColumns, sql } from 'drizzle-orm'

import { DocumentTrigger } from '../browser'
import { documentTriggers } from '../schema'
import Repository from './repositoryV2'
import { DocumentTriggerType } from '@latitude-data/constants'

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

  findByDocumentUuid(documentUuid: string): Promise<DocumentTrigger[]> {
    return this.scope
      .where(eq(documentTriggers.documentUuid, documentUuid))
      .execute() as Promise<DocumentTrigger[]>
  }

  findByProjectId(projectId: number): Promise<DocumentTrigger[]> {
    return this.scope
      .where(eq(documentTriggers.projectId, projectId))
      .execute() as Promise<DocumentTrigger[]>
  }

  findByIntegrationId(integrationId: number): Promise<DocumentTrigger[]> {
    return this.scope
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Integration),
          sql`${documentTriggers.configuration}->>'integrationId' = ${integrationId}`,
        ),
      )
      .execute() as Promise<DocumentTrigger[]>
  }
}
