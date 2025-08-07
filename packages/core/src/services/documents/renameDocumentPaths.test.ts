import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { DocumentVersionsRepository } from '../../repositories'
import * as factories from '../../tests/factories'
import { BadRequestError } from './../../lib/errors'
import { renameDocumentPaths } from './renameDocumentPaths'

describe('renameDocumentPaths', () => {
  it('renames a single document path', async () => {
    const { project, user } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'a/b': factories.helpers.createPrompt({ provider: 'openai' }),
        'a/b/c': factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })

    const result = await renameDocumentPaths({
      commit: draft,
      oldPath: 'a/b', // a/b/c should not be affected, since I'm only renaming a file
      newPath: 'new/path',
    })

    expect(result.ok).toBeTruthy()

    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const docs = await docsScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    const paths = docs.map((d) => d.path).sort()
    expect(paths).toEqual(['a/b/c', 'new/path'])
  })

  it('renames a folder path', async () => {
    const { project, user } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'a/b/c': factories.helpers.createPrompt({ provider: 'openai' }),
        'a/b/c/d': factories.helpers.createPrompt({ provider: 'openai' }),
        'not/affected': factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })

    const result = await renameDocumentPaths({
      commit: draft,
      oldPath: 'a/b/',
      newPath: 'newpath/',
    })

    expect(result.ok).toBeTruthy()

    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const docs = await docsScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    const paths = docs.map((d) => d.path).sort()
    expect(paths).toEqual(['newpath/c', 'newpath/c/d', 'not/affected'])
  })

  it('fails when trying to rename a folder as a document', async () => {
    const { project, user } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'a/b': factories.helpers.createPrompt({ provider: 'openai' }),
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })

    const result = await renameDocumentPaths({
      commit: draft,
      oldPath: 'a/',
      newPath: 'new/path',
    })

    expect(result.error).toBeInstanceOf(BadRequestError)
  })
})
