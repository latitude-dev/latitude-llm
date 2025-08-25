import { and, desc, eq, getTableColumns, isNull } from 'drizzle-orm'
import type { DocumentTriggerEvent, Commit } from '../browser'
import { documentTriggerEvents, commits } from '../schema'
import Repository from './repositoryV2'
import { Result } from '../lib/Result'
import type { PromisedResult } from '../lib/Transaction'
import { type LatitudeError, NotFoundError } from '@latitude-data/constants/errors'

const tt = getTableColumns(documentTriggerEvents)

export class DocumentTriggerEventsRepository extends Repository<DocumentTriggerEvent> {
  get scopeFilter() {
    return eq(documentTriggerEvents.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentTriggerEvents)
      .innerJoin(
        commits,
        and(eq(commits.id, documentTriggerEvents.commitId), isNull(commits.deletedAt)),
      )
      .where(this.scopeFilter)
      .$dynamic()
  }

  private async getTriggerEvents({
    commit,
    triggerUuid,
  }: {
    commit?: Commit
    triggerUuid?: string
  } = {}): PromisedResult<DocumentTriggerEvent[], LatitudeError> {
    const query = this.db
      .select(tt)
      .from(documentTriggerEvents)
      .innerJoin(
        commits,
        and(eq(commits.id, documentTriggerEvents.commitId), isNull(commits.deletedAt)),
      )
      .where(
        and(
          eq(documentTriggerEvents.workspaceId, this.workspaceId),
          commit ? eq(documentTriggerEvents.commitId, commit.id) : undefined,
          triggerUuid ? eq(documentTriggerEvents.triggerUuid, triggerUuid) : undefined,
        ),
      )
      .orderBy(desc(documentTriggerEvents.createdAt), desc(documentTriggerEvents.id))

    const results = await query

    return Result.ok(results as DocumentTriggerEvent[])
  }

  getAllTriggerEventsInWorkspace(): PromisedResult<DocumentTriggerEvent[], LatitudeError> {
    return this.getTriggerEvents()
  }

  getTriggerEventsInCommit({
    commit,
  }: {
    commit: Commit
  }): PromisedResult<DocumentTriggerEvent[], LatitudeError> {
    return this.getTriggerEvents({ commit })
  }

  async getTriggerEventsInTrigger({
    triggerUuid,
    commit,
  }: {
    triggerUuid: string
    commit?: Commit
  }): PromisedResult<DocumentTriggerEvent[], LatitudeError> {
    return this.getTriggerEvents({ triggerUuid, commit })
  }

  async getTriggerEventById({
    id,
  }: {
    id: number
  }): PromisedResult<DocumentTriggerEvent, LatitudeError> {
    const results = await this.db
      .select(tt)
      .from(documentTriggerEvents)
      .innerJoin(
        commits,
        and(eq(commits.id, documentTriggerEvents.commitId), isNull(commits.deletedAt)),
      )
      .where(
        and(
          eq(documentTriggerEvents.workspaceId, this.workspaceId),
          eq(documentTriggerEvents.id, id),
        ),
      )

    const event = results[0]
    if (!event) {
      return Result.error(new NotFoundError(`Trigger event with id '${id}' not found`))
    }

    return Result.ok(event as DocumentTriggerEvent)
  }
}
