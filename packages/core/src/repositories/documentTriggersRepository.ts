import {
  and,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lte,
  max,
} from 'drizzle-orm'

import { Commit, DocumentTrigger } from '../browser'
import { commits, documentTriggers } from '../schema'
import Repository from './repositoryV2'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import { LatitudeError, NotFoundError } from '@latitude-data/constants/errors'
import { DocumentTriggerType } from '@latitude-data/constants'

function mergeTriggers(
  publishedTriggers: DocumentTrigger[],
  draftTriggers: DocumentTrigger[],
): DocumentTrigger[] {
  if (!draftTriggers.length) return publishedTriggers
  if (!publishedTriggers.length) return draftTriggers

  const mergedTriggers = new Map<string, DocumentTrigger>()

  for (const trigger of publishedTriggers) {
    mergedTriggers.set(trigger.uuid, trigger)
  }

  for (const trigger of draftTriggers) {
    // If a draft trigger exists, it takes precedence over the published one
    mergedTriggers.set(trigger.uuid, trigger)
  }

  return Array.from(mergedTriggers.values())
}

const tt = getTableColumns(documentTriggers)

export class DocumentTriggersRepository extends Repository<DocumentTrigger> {
  get scopeFilter() {
    return eq(documentTriggers.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(documentTriggers)
      .innerJoin(
        commits,
        and(
          eq(commits.id, documentTriggers.commitId),
          isNull(commits.deletedAt),
        ),
      )
      .where(this.scopeFilter)
      .$dynamic()
  }

  private async getTriggers({
    commit,
    projectId: _projectId,
  }: {
    commit?: Commit
    projectId?: number
  } = {}): PromisedResult<DocumentTrigger[], LatitudeError> {
    const projectId = _projectId ?? commit?.projectId
    const maxMergedAt = commit?.mergedAt ?? undefined

    // UUID & mergedAt of the last version of each document trigger
    const lastVersionOfEachTrigger = this.db.$with('lastVersionOfDocuments').as(
      this.db
        .select({
          uuid: documentTriggers.uuid,
          mergedAt: max(commits.mergedAt).as('maxMergedAt'),
        })
        .from(documentTriggers)
        .innerJoin(
          commits,
          and(
            eq(commits.id, documentTriggers.commitId),
            eq(commits.projectId, documentTriggers.projectId),
          ),
        )
        .where(
          and(
            eq(documentTriggers.workspaceId, this.workspaceId),
            isNull(commits.deletedAt),
            isNotNull(commits.mergedAt),
            maxMergedAt ? lte(commits.mergedAt, maxMergedAt) : undefined,
            projectId ? eq(documentTriggers.projectId, projectId) : undefined,
          ),
        )
        .groupBy(documentTriggers.uuid),
    )

    // All document triggers from the last committed version
    const mergedTriggers = await this.db
      .with(lastVersionOfEachTrigger)
      .select(tt)
      .from(documentTriggers)
      .innerJoin(
        commits,
        and(
          eq(commits.id, documentTriggers.commitId),
          isNotNull(commits.mergedAt),
          isNull(commits.deletedAt),
        ),
      )
      .innerJoin(
        lastVersionOfEachTrigger,
        and(
          eq(documentTriggers.workspaceId, this.workspaceId),
          eq(lastVersionOfEachTrigger.uuid, documentTriggers.uuid),
          eq(lastVersionOfEachTrigger.mergedAt, commits.mergedAt),
        ),
      )

    // Triggers created/updated specifically in this commit
    const draftTriggers =
      commit && !commit.mergedAt
        ? await this.db
            .select(tt)
            .from(documentTriggers)
            .where(eq(documentTriggers.commitId, commit.id))
        : []

    // Merge the two sets of triggers, giving priority to the draft triggers
    const totalTriggers = mergeTriggers(
      mergedTriggers as DocumentTrigger[],
      draftTriggers as DocumentTrigger[],
    )

    // Remove deleted triggers
    const activeTriggers = totalTriggers.filter((trigger) => !trigger.deletedAt)

    return Result.ok(activeTriggers)
  }

  getAllActiveTriggersInWorkspace(): PromisedResult<
    DocumentTrigger[],
    LatitudeError
  > {
    return this.getTriggers()
  }

  getTriggersInProject({
    projectId,
    commit,
  }: {
    projectId: number
    commit?: Commit
  }): PromisedResult<DocumentTrigger[], LatitudeError> {
    return this.getTriggers({ projectId, commit })
  }

  async getTriggersInDocument({
    documentUuid,
    commit,
  }: {
    documentUuid: string
    commit?: Commit
  }): PromisedResult<DocumentTrigger[], LatitudeError> {
    const result = await this.getTriggers({ commit })
    if (!Result.isOk(result)) return result
    const triggers = result.unwrap()

    return Result.ok(
      triggers.filter((trigger) => trigger.documentUuid === documentUuid),
    )
  }

  async getTriggerByUuid<T extends DocumentTriggerType>({
    uuid,
    commit,
  }: {
    uuid: string
    commit?: Commit
  }): PromisedResult<DocumentTrigger<T>, LatitudeError> {
    const result = await this.getTriggers({ commit })
    if (!Result.isOk(result)) return result
    const triggers = result.unwrap()

    const trigger = triggers.find((t) => t.uuid === uuid)
    if (!trigger) {
      const errorMsg = commit
        ? `Trigger with uuid '${uuid}' not found in commit '${commit.uuid}'`
        : `Trigger with uuid '${uuid}' not found`

      return Result.error(new NotFoundError(errorMsg))
    }

    return Result.ok(trigger as DocumentTrigger<T>)
  }

  async getTriggerUpdatesInDraft(
    draft: Commit,
  ): PromisedResult<DocumentTrigger[], LatitudeError> {
    const results = await this.db
      .select(tt)
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.workspaceId, this.workspaceId),
          eq(documentTriggers.commitId, draft.id),
        ),
      )

    return Result.ok(results as DocumentTrigger[])
  }
}
