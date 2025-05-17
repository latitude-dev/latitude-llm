import { describe, it, expect, beforeEach } from 'vitest'
import { countDocumentLogs } from './countDocumentLogs'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { LogSources, Providers } from '@latitude-data/constants'
import {
  createDocumentLog,
  createProject,
  helpers,
} from '../../tests/factories'
import { Commit, DocumentVersion } from '../../browser'

describe('countDocumentLogs', () => {
  let document: DocumentVersion
  let commit: Commit

  beforeEach(async () => {
    // Create a new project with a document for each test
    const { documents, commit: c } = await createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'test-document.md': helpers.createPrompt({
          provider: 'openai',
        }),
      },
    })
    document = documents[0]!
    commit = c
  })

  it('should return 0 when no logs exist for the document', async () => {
    const count = await countDocumentLogs(generateUUIDIdentifier())
    expect(count).toBe(0)
  })

  it('should correctly count a single document log', async () => {
    // Create one document log
    await createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    const count = await countDocumentLogs(document.documentUuid)
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

    const count = await countDocumentLogs(document.documentUuid)
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

    const count = await countDocumentLogs(document.documentUuid)
    expect(count).toBe(1)
  })
})
