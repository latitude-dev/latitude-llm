import { LogSources, Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { Commit, DocumentVersion, User } from '../../browser'
import {
  createCommit,
  createDocumentLog,
  createProject,
  helpers,
} from '../../tests/factories'
import { deleteCommitDraft } from '../commits'
import { countDocumentLogs } from './countDocumentLogs'

describe('countDocumentLogs', () => {
  let document: DocumentVersion
  let commit: Commit
  let user: User

  beforeEach(async () => {
    // Create a new project with a document for each test
    const {
      documents,
      commit: c,
      user: u,
    } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test-document.md': helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    document = documents[0]!
    commit = c
    user = u
  })

  it('should correctly count a single document log', async () => {
    // Create one document log
    await createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    const count = await countDocumentLogs(document)
    expect(count).toBe(1)
  })

  it('should correctly count multiple document logs', async () => {
    // Create multiple document logs
    await Promise.all([
      createDocumentLog({
        document,
        commit,
        source: LogSources.API,
      }),
      createDocumentLog({
        document,
        commit,
        source: LogSources.API,
      }),
      createDocumentLog({
        document,
        commit,
        source: LogSources.API,
      }),
    ])

    const count = await countDocumentLogs(document)
    expect(count).toBe(3)
  })

  it('should only count logs for the specified document', async () => {
    const { documents, commit: commit2 } = await createProject({
      documents: {
        'test-document.md': helpers.createPrompt({
          provider: 'openai',
        }),
      },
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
    })

    const document2 = documents[0]!

    // Create a document log for our test document
    await createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    // Create a document log for a different document
    await createDocumentLog({
      document: document2,
      commit: commit2,
      source: LogSources.API,
    })

    const count = await countDocumentLogs(document)
    expect(count).toBe(1)
  })

  it('should exclude logs from deleted commits', async () => {
    // Create a document log
    const deletedCommit = await createCommit({
      projectId: commit.projectId,
      user,
    })

    await deleteCommitDraft(deletedCommit)

    await createDocumentLog({
      document,
      commit: deletedCommit,
      source: LogSources.API,
    })

    const count = await countDocumentLogs(document)
    expect(count).toBe(0)
  })
})
