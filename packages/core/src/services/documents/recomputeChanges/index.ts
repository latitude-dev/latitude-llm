import { omit } from 'lodash-es'
import path from 'path'

import { and, eq, inArray, not } from 'drizzle-orm'
import { scan } from 'promptl-ai'

import { AgentToolsMap } from '@latitude-data/constants'
import { latitudePromptConfigSchema } from '@latitude-data/constants/latitudePromptSchema'

import {
  Commit,
  DocumentVersion,
  ProviderApiKey,
  Workspace,
} from '../../../browser'
import { assertCommitIsDraft } from '../../../lib/assertCommitIsDraft'
import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import {
  IntegrationsRepository,
  ProviderApiKeysRepository,
} from '../../../repositories'
import { documentVersions } from '../../../schema'
import { buildAgentsToolsMap } from '../../agents/agentsAsTools'
import { inheritDocumentRelations } from '../inheritRelations'
import { getHeadDocumentsAndDraftDocumentsForCommit } from './getHeadDocumentsAndDraftDocuments'
import { getMergedAndDraftDocuments } from './getMergedAndDraftDocuments'

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

      // FIXME: infinite recursion
      // @ts-ignore
      const metadata = await scan({
        prompt: d.content ?? '',
        fullPath: d.path,
        referenceFn: getDocumentContent,
        // @ts-expect-error - TODO(compiler): fix types
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
    workspace,
  }: {
    commit: Commit
    documentChanges: DocumentVersion[]
    workspace: Workspace
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

    await Promise.all(
      insertedDocs.map(async (toVersion) => {
        const fromVersion = docsToInsert.find(
          (d) => d.documentUuid === toVersion.documentUuid,
        )!
        return await inheritDocumentRelations(
          {
            fromVersion,
            toVersion,
            workspace,
          },
          transaction,
        ).then((r) => r.unwrap())
      }),
    )

    return Result.ok([...insertedDocs, ...updatedDocs])
  })
}

export type RecomputedChanges = {
  changedDocuments: DocumentVersion[]
  headDocuments: DocumentVersion[]
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
    assertCommitIsDraft(draft).unwrap()

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

    const providersScope = new ProviderApiKeysRepository(workspace.id, tx)
    const providersResult = await providersScope.findAll()
    if (providersResult.error) return Result.error(providersResult.error)

    const agentToolsMapResult = await buildAgentsToolsMap(
      {
        workspace,
        commit: draft,
      },
      tx,
    )

    const integrationsScope = new IntegrationsRepository(workspace.id, tx)
    const integrations = await integrationsScope.findAll()
    if (integrations.error) return Result.error(integrations.error)
    if (agentToolsMapResult.error)
      return Result.error(agentToolsMapResult.error)

    const { documents: documentsToUpdate, errors } =
      await resolveDocumentChanges({
        originalDocuments: mergedDocuments,
        newDocuments: draftDocuments,
        providers: providersResult.value,
        agentToolsMap: agentToolsMapResult.value,
        integrationNames: integrations.value.map((i) => i.name),
      })

    const newDraftDocuments = (
      await replaceCommitChanges(
        {
          commit: draft,
          documentChanges: documentsToUpdate,
          workspace: workspace,
        },
        transaction,
      )
    ).unwrap()

    return Result.ok({
      headDocuments: mergedDocuments,
      changedDocuments: newDraftDocuments,
      errors,
    })
  })
}
