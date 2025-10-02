import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import writePrompt from './writePrompt'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { Commit, Project, User, Workspace } from '../../../../../schema/types'
import * as factories from '../../../../../tests/factories'
import { createLatteThread } from '../../threads/createThread'
import { LatteToolContext } from '../types'
import { WebsocketClient } from '../../../../../websockets/workers'
import type { CompileError } from 'promptl-ai'

vi.spyOn(WebsocketClient, 'sendEvent').mockImplementation(vi.fn())

describe('writePrompt', () => {
  let workspace: Workspace
  let user: User
  let project: Project
  let draft: Commit

  let latteContext: LatteToolContext

  beforeEach(async () => {
    const {
      workspace: w,
      user: u,
      project: p,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      skipMerge: true,
    })

    workspace = w
    user = u
    project = p
    draft = c

    const latteThread = await createLatteThread({
      workspace,
      user,
      project,
    }).then((r) => r.unwrap())

    latteContext = {
      workspace,
      user,
      project,
      threadUuid: latteThread.uuid,
      context: {} as any,
      toolName: 'writePrompt' as any,
      toolCall: null as any,
    } as unknown as LatteToolContext
  })

  it('creates a prompt in a draft', async () => {
    const path = 'prompts/new-prompt'
    const content = 'This is a new prompt content'

    const result = await writePrompt(
      {
        versionUuid: draft.uuid,
        path,
        content,
      },
      latteContext,
    )

    expect(result.ok).toBe(true)
    const { success } = result.unwrap() as { success: boolean }
    expect(success).toBe(true)

    const documentScope = new DocumentVersionsRepository(workspace.id)
    const docs = await documentScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())

    expect(docs).toHaveLength(1)
    expect(docs[0]!.path).toBe(path)
    expect(docs[0]!.content).toBe(content)
  })

  it('updates an existing prompt in a draft', async () => {
    const path = 'prompts/existing-prompt'
    const originalContent = 'Original prompt content'
    const newContent = 'Updated prompt content'

    const { documentVersion } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: path,
      content: originalContent,
    })

    const result = await writePrompt(
      {
        versionUuid: draft.uuid,
        path,
        content: newContent,
      },
      latteContext,
    )

    expect(result.ok).toBe(true)
    const { success } = result.unwrap() as { success: boolean }
    expect(success).toBe(true)

    const documentScope = new DocumentVersionsRepository(workspace.id)
    const docs = await documentScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())

    expect(docs).toHaveLength(1)
    expect(docs[0]!.documentUuid).toBe(documentVersion.documentUuid)
    expect(docs[0]!.path).toBe(path)
    expect(docs[0]!.content).toBe(newContent)
  })

  it('returns all document syntax errors', async () => {
    const path = 'prompts/syntax-error-prompt'
    const content = `
---
provider: notexisting
model: dont-care
temperature: wrong
---

{{ unclosed-tag
`

    const result = await writePrompt(
      {
        versionUuid: draft.uuid,
        path,
        content,
      },
      latteContext,
    )

    expect(result.ok).toBe(true)
    const { success, syntaxErrors } = result.unwrap() as {
      success: boolean
      syntaxErrors: CompileError[]
    }

    expect(success).toBe(true)
    expect(syntaxErrors).toBeDefined()
    expect(syntaxErrors).toHaveLength(3)
  })

  it('returns a list of parameters defined in the prompt', async () => {
    const path = 'prompts/parameters-prompt'
    const content = `
---
provider: openai
model: gpt-4o
---

Parameter 1: {{ foo }}
Parameter 2: {{ bar }}
`

    const result = await writePrompt(
      {
        versionUuid: draft.uuid,
        path,
        content,
      },
      latteContext,
    )

    expect(result.ok).toBe(true)
    const { success, parameters } = result.unwrap() as {
      success: boolean
      parameters: Record<string, string>
    }

    expect(success).toBe(true)
    expect(parameters).toEqual(['foo', 'bar'])
  })
})
