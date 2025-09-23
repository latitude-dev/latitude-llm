import path from 'path'

import { type ConversationMetadata, scan } from 'promptl-ai'

import { Commit, DocumentVersion } from '../../browser'
import { database } from '../../client'
import { LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { findWorkspaceFromCommit } from '../../data-access'

export async function getDocumentMetadata({
  document,
  getDocumentByPath,
}: {
  document: DocumentVersion
  getDocumentByPath:
    | ((path: string) => Promise<DocumentVersion | undefined>)
    | ((path: string) => DocumentVersion | undefined)
}) {
  const referenceFn = async (refPath: string, from?: string) => {
    const fullPath = path
      .resolve(path.dirname(`/${from ?? ''}`), refPath)
      .replace(/^\//, '')

    const doc = await getDocumentByPath(fullPath)
    if (!doc) return undefined

    return {
      path: fullPath,
      content: doc.content,
    }
  }

  return await scan({
    prompt: document.content,
    fullPath: document.path,
    referenceFn,
  })
}

export async function scanDocumentContent(
  {
    document,
    commit,
  }: {
    document: DocumentVersion
    commit: Commit
  },
  db = database,
): Promise<TypedResult<ConversationMetadata, LatitudeError>> {
  let docs: DocumentVersion[] | undefined

  const metadata = await getDocumentMetadata({
    document,
    getDocumentByPath: async (path) => {
      if (!docs) {
        const workspace = await findWorkspaceFromCommit(commit, db)
        const documentScope = new DocumentVersionsRepository(workspace.id, db)
        docs = await documentScope
          .getDocumentsAtCommit(commit)
          .then((r) => r.unwrap())
      }

      return docs?.find((d) => d.path === path)
    },
  })

  return Result.ok(metadata)
}

export async function scanCommitDocumentContents({
  commit,
}: {
  commit: Commit
}): Promise<
  TypedResult<{ [path: string]: ConversationMetadata }, LatitudeError>
> {
  const workspace = await findWorkspaceFromCommit(commit)
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const docs = await documentScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  try {
    const metadata = await Promise.all(
      docs.map(
        async (doc) =>
          [
            doc.path,
            await scanDocumentContent({
              document: doc,
              commit,
            }).then((r) => r.unwrap()),
          ] as [string, ConversationMetadata],
      ),
    )

    return Result.ok(Object.fromEntries(metadata))
  } catch (error) {
    return Result.error(error as LatitudeError)
  }
}
