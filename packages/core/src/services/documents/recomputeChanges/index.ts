import { omit } from 'lodash-es'
import path from 'path'

import {
  readMetadata,
  Document as RefDocument,
  type CompileError,
} from '@latitude-data/compiler'
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
import { database } from '../../../client'
import { assertCommitIsDraft } from '../../../lib/assertCommitIsDraft'
import {
  IntegrationsRepository,
  ProviderApiKeysRepository,
} from '../../../repositories'
import { documentVersions } from '../../../schema'
import { buildAgentsToolsMap } from '../../agents/agentsAsTools'
import { inheritDocumentRelations } from '../inheritRelations'
import { getHeadDocumentsAndDraftDocumentsForCommit } from './getHeadDocumentsAndDraftDocuments'
import { getMergedAndDraftDocuments } from './getMergedAndDraftDocuments'
import { hashContent } from './../../../lib/hashContent'
import { Result } from './../../../lib/Result'
import { TypedResult } from './../../../lib/Result'
import Transaction from './../../../lib/Transaction'

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
  errors: Record<string, CompileError[]>
}> {
  const errors: Record<string, CompileError[]> = {}

  const getDocumentContent = async (
    refPath: string,
    from?: string,
  ): Promise<RefDocument | undefined> => {
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

      if (d.promptlVersion === 0) {
        const metadata = await readMetadata({
          prompt: d.content ?? '',
          fullPath: d.path,
          referenceFn: getDocumentContent,
          configSchema,
        })
        if (!d.deletedAt && metadata.errors.length > 0) {
          errors[d.documentUuid] = metadata.errors
        }

        return {
          ...d,
          resolvedContent: metadata.resolvedPrompt,
          contentHash: hashContent(metadata.resolvedPrompt),
        }
      }
      // FIXME:
      // @ts-ignore - infinite type instantiation loop
      const metadata = await scan({
        prompt: d.content ?? '',
        fullPath: d.path,
        referenceFn: getDocumentContent,
        // FIXME:
        // @ts-ignore
        configSchema,
      })

      if (!d.deletedAt && metadata.errors.length > 0) {
        errors[d.documentUuid] = metadata.errors as CompileError[]
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
          oldDoc.promptlVersion === newDoc.promptlVersion &&
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
  tx = database,
): Promise<TypedResult<DocumentVersion[], Error>> {
  const commitId = commit.id
  return Transaction.call<DocumentVersion[]>(async (trx) => {
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
          { fromVersion, toVersion, workspace },
          trx,
        ).then((r) => r.unwrap())
      }),
    )

    return Result.ok([...insertedDocs, ...updatedDocs])
  }, tx)
}

export type RecomputedChanges = {
  changedDocuments: DocumentVersion[]
  headDocuments: DocumentVersion[]
  errors: { [documentUuid: string]: CompileError[] }
}

export async function recomputeChanges(
  {
    workspace,
    draft,
  }: {
    workspace: Workspace
    draft: Commit
  },
  tx = database,
): Promise<TypedResult<RecomputedChanges, Error>> {
  try {
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
        tx,
      )
    ).unwrap()

    return Result.ok({
      headDocuments: mergedDocuments,
      changedDocuments: newDraftDocuments,
      errors,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
