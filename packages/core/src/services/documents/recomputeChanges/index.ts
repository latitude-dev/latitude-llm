import { omit } from 'lodash-es'
import path from 'path'

import { and, eq, inArray, not } from 'drizzle-orm'
import { scan } from 'promptl-ai'

import { AgentToolsMap } from '@latitude-data/constants'

import { type Commit } from '../../../schema/models/types/Commit'
import { type DocumentVersion } from '../../../schema/models/types/DocumentVersion'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { CommitsRepository } from '../../../repositories'
import { findAllProviderApiKeys } from '../../../queries/providerApiKeys/findAll'
import { findAllIntegrations } from '../../../queries/integrations/findAll'
import { documentVersions } from '../../../schema/models/documentVersions'
import { buildAgentsToolsMap } from '../../agents/agentsAsTools'
import { canInheritDocumentRelations } from '../inheritRelations'
import { getHeadDocumentsAndDraftDocumentsForCommit } from './getHeadDocumentsAndDraftDocuments'
import { getMergedAndDraftDocuments } from './getMergedAndDraftDocuments'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'

async function resolveDocumentChanges({
  originalDocuments,
  newDocuments,
  providers,
  integrationNames,
  agentToolsMap,
}: {
  originalDocuments: DocumentVersion[]
  newDocuments: DocumentVersion[]
  providers: ProviderApiKey[]
  integrationNames: string[]
  agentToolsMap: AgentToolsMap
}): Promise<{
  documents: DocumentVersion[]
  errors: Record<string, Error[]>
}> {
  const errors: Record<string, Error[]> = {}

  const getDocumentContent = async (refPath: string, from?: string) => {
    const fullPath = path
      .resolve(path.dirname(`/${from ?? ''}`), refPath)
      .replace(/^\//, '')
    const document = newDocuments.find((d) => d.path === fullPath)
    if (!document) return undefined
    return {
      path: document.path,
      content: document.content,
    }
  }

  const newDocumentsWithUpdatedHash = await Promise.all(
    newDocuments.map(async (d) => {
      const configSchema = latitudePromptConfigSchema({
        fullPath: d.path,
        providerNames: providers.map((p) => p.name),
        agentToolsMap,
        integrationNames,
      })

      const metadata = await scan({
        prompt: d.content ?? '',
        fullPath: d.path,
        referenceFn: getDocumentContent,
        configSchema,
      })

      if (!d.deletedAt && metadata.errors.length > 0) {
        errors[d.documentUuid] = metadata.errors as Error[]
      }

      return {
        ...d,
        resolvedContent: metadata.resolvedPrompt,
        contentHash: metadata.hash,
      }
    }),
  )

  const changedDocuments = newDocumentsWithUpdatedHash.filter(
    (newDoc) =>
      !originalDocuments.find(
        (oldDoc) =>
          oldDoc.documentUuid === newDoc.documentUuid &&
          oldDoc.contentHash === newDoc.contentHash &&
          oldDoc.path === newDoc.path &&
          oldDoc.deletedAt === newDoc.deletedAt,
      ),
  )

  return { documents: changedDocuments, errors }
}

async function replaceCommitChanges(
  {
    commit,
    documentChanges,
  }: {
    commit: Commit
    documentChanges: DocumentVersion[]
  },
  transaction = new Transaction(),
): Promise<TypedResult<DocumentVersion[], Error>> {
  const commitId = commit.id
  return transaction.call<DocumentVersion[]>(async (trx) => {
    const previousDraftDocuments = await trx
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.commitId, commitId))

    await trx.delete(documentVersions).where(
      and(
        eq(documentVersions.commitId, commitId),
        not(
          inArray(
            documentVersions.documentUuid,
            documentChanges.map((d) => d.documentUuid),
          ),
        ),
      ),
    )

    if (documentChanges.length === 0) return Result.ok([])

    const [docsToInsert, docsToUpdate] = documentChanges.reduce(
      (acc, doc) => {
        const existingDoc = previousDraftDocuments.find(
          (d) => d.documentUuid === doc.documentUuid,
        )
        if (existingDoc) {
          acc[1].push(doc)
        } else {
          acc[0].push(doc)
        }
        return acc
      },
      [[], []] as [DocumentVersion[], DocumentVersion[]],
    )

    const insertedDocs = docsToInsert.length
      ? await trx
          .insert(documentVersions)
          .values(
            docsToInsert.map((d) => ({
              ...omit(d, ['id', 'commitId', 'updatedAt']),
              commitId,
            })),
          )
          .returning()
      : []

    const updatedDocs = docsToUpdate.length
      ? await Promise.all(
          docsToUpdate.map(async (doc) => {
            const updatedDoc = await trx
              .update(documentVersions)
              .set({
                ...omit(doc, ['id', 'commitId', 'updatedAt']),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(documentVersions.documentUuid, doc.documentUuid),
                  eq(documentVersions.commitId, commitId),
                ),
              )
              .returning()

            return updatedDoc[0]!
          }),
        )
      : []

    insertedDocs.map(async (toVersion) => {
      const fromVersion = docsToInsert.find(
        (d) => d.documentUuid === toVersion.documentUuid,
      )!
      return canInheritDocumentRelations({
        fromVersion,
        toVersion,
      }).unwrap()
    })

    return Result.ok([...insertedDocs, ...updatedDocs])
  })
}

export type RecomputedChanges = {
  changedDocuments: DocumentVersion[]
  headDocuments: DocumentVersion[]
  mainDocumentChanged: boolean
  errors: { [documentUuid: string]: Error[] }
}

export async function recomputeChanges(
  {
    workspace,
    draft,
  }: {
    workspace: Workspace
    draft: Commit
  },
  transaction = new Transaction(),
): Promise<TypedResult<RecomputedChanges, Error>> {
  return transaction.call(async (tx) => {
    const commitsRepository = new CommitsRepository(workspace.id, tx)
    const previousCommit = await commitsRepository.getPreviousCommit(draft)

    // Check if mainDocumentUuid changed
    const mainDocumentChanged =
      previousCommit?.mainDocumentUuid !== draft.mainDocumentUuid

    const result = await getHeadDocumentsAndDraftDocumentsForCommit(
      { commit: draft, workspaceId: workspace.id },
      tx,
    )
    if (result.error) return result

    const { headDocuments, documentsInDrafCommit } = result.value
    const { mergedDocuments, draftDocuments } = getMergedAndDraftDocuments({
      headDocuments,
      documentsInDrafCommit,
    })

    const providers = await findAllProviderApiKeys(
      { workspaceId: workspace.id },
      tx,
    )

    const agentToolsMapResult = await buildAgentsToolsMap(
      {
        workspace,
        commit: draft,
      },
      tx,
    )

    const allIntegrations = await findAllIntegrations(
      { workspaceId: workspace.id },
      tx,
    )
    if (agentToolsMapResult.error)
      return Result.error(agentToolsMapResult.error)

    const { documents: documentsToUpdate, errors } =
      await resolveDocumentChanges({
        originalDocuments: mergedDocuments,
        newDocuments: draftDocuments,
        providers,
        agentToolsMap: agentToolsMapResult.value,
        integrationNames: allIntegrations.map((i) => i.name),
      })

    const newDraftDocuments = (
      await replaceCommitChanges(
        {
          commit: draft,
          documentChanges: documentsToUpdate,
        },
        transaction,
      )
    ).unwrap()

    return Result.ok({
      headDocuments: mergedDocuments,
      changedDocuments: newDraftDocuments,
      mainDocumentChanged,
      errors,
    })
  })
}
