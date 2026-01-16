import {
  and,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  lte,
  max,
} from 'drizzle-orm'

import { type Commit } from '../schema/models/types/Commit'
import { type DocumentTrigger } from '../schema/models/types/DocumentTrigger'
import { commits } from '../schema/models/commits'
import { documentTriggers } from '../schema/models/documentTriggers'
import { projects } from '../schema/models/projects'
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

    // Get merged triggers using the helper method
    const mergedTriggers = await this.getTriggersFromMergedCommits({
      maxMergedAt,
      projectId,
    })

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

  /**
   * Returns the last version of each merged trigger plus all draft triggers.
   * This provides a clean view of the current state without duplicates.
   */
  async getAllTriggers(): PromisedResult<DocumentTrigger[], LatitudeError> {
    const mergedTriggers = await this.getTriggersFromMergedCommits()
    const draftTriggers = await this.db
      .select(tt)
      .from(documentTriggers)
      .innerJoin(
        commits,
        and(
          eq(commits.id, documentTriggers.commitId),
          isNull(commits.mergedAt),
          isNull(commits.deletedAt),
        ),
      )
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .where(
        and(
          eq(documentTriggers.workspaceId, this.workspaceId),
          isNull(projects.deletedAt),
        ),
      )

    const totalTriggers = mergeTriggers(
      mergedTriggers,
      draftTriggers as DocumentTrigger[],
    )

    const activeTriggers = totalTriggers.filter((trigger) => !trigger.deletedAt)
    return Result.ok(activeTriggers)
  }

  async getTriggersInProject({
    projectId,
    commit,
  }: {
    projectId: number
    commit?: Commit
  }): PromisedResult<DocumentTrigger[], LatitudeError> {
    const triggersResult = await this.getTriggers({ projectId, commit })
    if (triggersResult.error) return triggersResult

    return Result.ok(
      triggersResult.value.sort(
        (a, b) =>
          (a.triggerType === DocumentTriggerType.Integration ? 1 : 0) -
            (b.triggerType === DocumentTriggerType.Integration ? 1 : 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    )
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

  /**
   * Gets triggers based on commit context and project filtering.
   * NOTE: This method does NOT return all triggers that are not active unless passing a commit parameter.
   * For a simple method that returns all document triggers, use getAllTriggers() instead.
   */
  /**
   * Helper method to get the last version of each merged trigger
   */
  private async getTriggersFromMergedCommits({
    maxMergedAt,
    projectId,
  }: {
    maxMergedAt?: Date
    projectId?: number
  } = {}): Promise<DocumentTrigger[]> {
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
        .innerJoin(projects, eq(projects.id, commits.projectId))
        .where(
          and(
            eq(documentTriggers.workspaceId, this.workspaceId),
            isNull(commits.deletedAt),
            isNull(projects.deletedAt),
            isNotNull(commits.mergedAt),
            maxMergedAt ? lte(commits.mergedAt, maxMergedAt) : undefined,
            projectId ? eq(documentTriggers.projectId, projectId) : undefined,
          ),
        )
        .groupBy(documentTriggers.uuid),
    )

    // Get merged triggers (last version of each)
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
      .innerJoin(projects, eq(projects.id, commits.projectId))
      .innerJoin(
        lastVersionOfEachTrigger,
        and(
          eq(documentTriggers.workspaceId, this.workspaceId),
          eq(lastVersionOfEachTrigger.uuid, documentTriggers.uuid),
          eq(lastVersionOfEachTrigger.mergedAt, commits.mergedAt),
        ),
      )
      .where(isNull(projects.deletedAt))

    return mergedTriggers as DocumentTrigger[]
  }
}
