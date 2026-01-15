import path from 'path'

import { type ConversationMetadata, scan } from 'promptl-ai'

import { database } from '../../client'
import { findWorkspaceFromCommit } from '../../data-access/workspaces'
import { LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { DocumentVersionsRepository } from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'

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

  const scaned = (await scan({
    prompt: document.content,
    fullPath: document.path,
    referenceFn,
  })) as ConversationMetadata

  return scaned
}

const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/m
function getDocumentInstructions(prompt: string): string {
  return prompt.replace(FRONTMATTER_REGEX, '').trim()
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
): Promise<
  TypedResult<ConversationMetadata & { instructions: string }, LatitudeError>
> {
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

  const instructions = getDocumentInstructions(document.content)

  return Result.ok({ ...metadata, instructions })
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
