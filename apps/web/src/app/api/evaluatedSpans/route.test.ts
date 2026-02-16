import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createProject,
  createSpan,
  createWorkspace,
} from '@latitude-data/core/factories'
import {
  CompletionSpanMetadata,
  SPAN_METADATA_STORAGE_KEY,
  SpanType,
} from '@latitude-data/constants'
import { diskFactory } from '@latitude-data/core/lib/disk'
import { compressString } from '@latitude-data/core/lib/disk/compression'
import { cache as redis } from '@latitude-data/core/cache'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { GET } from './route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
    captureException: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))
vi.mock('$/helpers/captureException', () => ({
  captureException: mocks.captureException,
}))

describe('GET handler for evaluatedSpans', () => {
  let user: User
  let workspace: Workspace
  let project: Project
  let commit: Commit
  let document: DocumentVersion

  beforeEach(async () => {
    const setup = await createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    user = setup.user
    workspace = setup.workspace
    project = setup.project
    commit = setup.commit
    document = setup.documents[0]!
  })

  function buildRequest(params: Record<string, string>) {
    const searchParams = new URLSearchParams(params)
    return new NextRequest(
      `http://localhost:3000/api/evaluatedSpans?${searchParams.toString()}`,
    )
  }

  function buildConfiguration(overrides?: {
    messageSelection?: string
    parsingFormat?: string
  }) {
    return JSON.stringify({
      messageSelection: overrides?.messageSelection ?? 'last',
      parsingFormat: overrides?.parsingFormat ?? 'string',
    })
  }

  async function createEvaluableSpanWithCompletion({
    workspaceId,
    commitUuid,
    documentUuid,
    traceId,
    spanType = SpanType.Prompt,
    input = [
      {
        role: 'user',
        content: [{ type: 'text' as const, text: 'Test question' }],
      },
    ],
    output = [
      {
        role: 'assistant',
        content: [{ type: 'text' as const, text: 'Test answer' }],
        toolCalls: [],
      },
    ],
  }: {
    workspaceId: number
    commitUuid: string
    documentUuid: string
    traceId: string
    spanType?: SpanType.Prompt | SpanType.External | SpanType.Chat
    input?: Array<{
      role: string
      content: Array<{ type: string; text: string }>
    }>
    output?: Array<{
      role: string
      content: Array<{ type: string; text: string }>
      toolCalls: unknown[]
    }>
  }) {
    const evaluableSpan = await createSpan({
      workspaceId,
      commitUuid,
      documentUuid,
      type: spanType,
      traceId,
    })

    const completionSpan = await createSpan({
      workspaceId,
      commitUuid,
      documentUuid,
      type: SpanType.Completion,
      traceId,
      parentId: evaluableSpan.id,
    })

    const completionMetadata: CompletionSpanMetadata = {
      traceId: completionSpan.traceId,
      spanId: completionSpan.id,
      type: SpanType.Completion,
      attributes: {},
      events: [],
      links: [],
      provider: 'openai',
      model: 'gpt-4o',
      configuration: {},
      input: input as any,
      output: output as any,
    }

    const disk = diskFactory('private')
    const metadataKey = SPAN_METADATA_STORAGE_KEY(
      workspaceId,
      completionSpan.traceId,
      completionSpan.id,
    )
    const compressed = await compressString(JSON.stringify(completionMetadata))
    await disk.putBuffer(metadataKey, compressed)

    const cache = await redis()
    await cache.del(metadataKey)

    return { evaluableSpan, completionSpan }
  }

  async function createPromptSpanWithCompletion(
    params: Omit<
      Parameters<typeof createEvaluableSpanWithCompletion>[0],
      'spanType'
    >,
  ) {
    const result = await createEvaluableSpanWithCompletion({
      ...params,
      spanType: SpanType.Prompt,
    })
    return {
      promptSpan: result.evaluableSpan,
      completionSpan: result.completionSpan,
    }
  }

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)
      const request = buildRequest({
        projectId: project.id.toString(),
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        configuration: buildConfiguration(),
      })

      const response = await GET(request, { workspace } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user,
        session: { userId: user.id, currentWorkspaceId: workspace.id },
      })
    })

    describe('tenancy', () => {
      it('should not return spans from another workspace', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'other-workspace',
        })

        await createPromptSpanWithCompletion({
          workspaceId: otherWorkspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'other-workspace-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
        expect(data.count).toBe(0)
      })

      it('should only return spans from the authenticated workspace', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'own-workspace-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe('Test answer')
      })

      it('should not return span from other workspace even with same document uuid', async () => {
        const { workspace: otherWorkspace } = await createWorkspace({
          name: 'another-workspace',
        })

        await createPromptSpanWithCompletion({
          workspaceId: otherWorkspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'cross-workspace-attempt',
        })

        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'valid-workspace-trace',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
      })
    })

    describe('actual output extraction', () => {
      it('should extract last message with string format', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-last-string',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'First response' }],
              toolCalls: [],
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Last response' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration({
            messageSelection: 'last',
            parsingFormat: 'string',
          }),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe('Last response')
      })

      it('should extract all messages with string format', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-all-string',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'First response' }],
              toolCalls: [],
            },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Second response' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration({
            messageSelection: 'all',
            parsingFormat: 'string',
          }),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toContain('First response')
        expect(data.items[0].actualOutput).toContain('Second response')
      })

      it('should parse JSON format and return stringified output', async () => {
        const jsonContent = JSON.stringify({ answer: 'test value' })
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-json-format',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: jsonContent }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration({
            messageSelection: 'last',
            parsingFormat: 'json',
          }),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe(jsonContent)
      })

      it('should return messages in the response', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-with-messages',
          input: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'User question' }],
            },
          ],
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Assistant answer' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].messages).toHaveLength(2)
        expect(data.items[0].messages[0].role).toBe('user')
        expect(data.items[0].messages[1].role).toBe('assistant')
      })
    })

    describe('configuration validation', () => {
      it('should return error for missing configuration', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-no-config',
        })

        const searchParams = new URLSearchParams({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
        })
        const request = new NextRequest(
          `http://localhost:3000/api/evaluatedSpans?${searchParams.toString()}`,
        )

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(500)
      })

      it('should return error for invalid configuration JSON', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-invalid-json',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: 'invalid-json',
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.message).toBe('Invalid configuration parameter')
      })

      it('should return error for configuration missing required fields', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-missing-fields',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: JSON.stringify({ messageSelection: 'last' }),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.message).toBe('Invalid actual output configuration')
      })

      it('should return error for invalid messageSelection value', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-invalid-selection',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: JSON.stringify({
            messageSelection: 'invalid',
            parsingFormat: 'string',
          }),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.message).toBe('Invalid assistant message selection')
      })
    })

    describe('empty results', () => {
      it('should return empty array when no spans exist', async () => {
        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
        expect(data.count).toBe(0)
        expect(data.next).toBeNull()
      })
    })

    describe('pagination', () => {
      it('should return next cursor when more spans exist', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-pagination-1',
        })

        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-pagination-2',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.next).not.toBeNull()
      })

      it('should support cursor-based pagination', async () => {
        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-page-1',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Response 1' }],
              toolCalls: [],
            },
          ],
        })

        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-page-2',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Response 2' }],
              toolCalls: [],
            },
          ],
        })

        const firstRequest = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const firstResponse = await GET(firstRequest, { workspace } as any)
        const firstData = await firstResponse.json()

        expect(firstData.items).toHaveLength(1)
        expect(firstData.next).not.toBeNull()

        const secondRequest = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
          from: firstData.next,
        })

        const secondResponse = await GET(secondRequest, { workspace } as any)
        const secondData = await secondResponse.json()

        expect(secondData.items).toHaveLength(1)
        expect(secondData.items[0].actualOutput).not.toBe(
          firstData.items[0].actualOutput,
        )
      })
    })

    describe('evaluable span types', () => {
      it('should return Prompt span type', async () => {
        await createEvaluableSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-prompt-type',
          spanType: SpanType.Prompt,
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Prompt response' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe('Prompt response')
      })

      it('should return External span type', async () => {
        await createEvaluableSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-external-type',
          spanType: SpanType.External,
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'External response' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe('External response')
      })

      it('should return Chat span type', async () => {
        await createEvaluableSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-chat-type',
          spanType: SpanType.Chat,
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Chat response' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe('Chat response')
      })

      it('should return all evaluable span types when mixed', async () => {
        await createEvaluableSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-mixed-prompt',
          spanType: SpanType.Prompt,
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Prompt mixed' }],
              toolCalls: [],
            },
          ],
        })

        await createEvaluableSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-mixed-external',
          spanType: SpanType.External,
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'External mixed' }],
              toolCalls: [],
            },
          ],
        })

        await createEvaluableSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-mixed-chat',
          spanType: SpanType.Chat,
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Chat mixed' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const firstResponse = await GET(request, { workspace } as any)
        expect(firstResponse.status).toBe(200)
        const firstData = await firstResponse.json()
        expect(firstData.items).toHaveLength(1)
        expect(firstData.next).not.toBeNull()

        const secondRequest = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
          from: firstData.next,
        })
        const secondResponse = await GET(secondRequest, { workspace } as any)
        const secondData = await secondResponse.json()
        expect(secondData.items).toHaveLength(1)
        expect(secondData.next).not.toBeNull()

        const thirdRequest = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
          from: secondData.next,
        })
        const thirdResponse = await GET(thirdRequest, { workspace } as any)
        const thirdData = await thirdResponse.json()
        expect(thirdData.items).toHaveLength(1)

        const allOutputs = [
          firstData.items[0].actualOutput,
          secondData.items[0].actualOutput,
          thirdData.items[0].actualOutput,
        ].sort()
        expect(allOutputs).toEqual(
          ['Chat mixed', 'External mixed', 'Prompt mixed'].sort(),
        )
      })

      it('should not return non-evaluable span types like Completion', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Completion,
          traceId: 'trace-completion-only',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
        expect(data.count).toBe(0)
      })

      it('should not return non-evaluable span types like Tool', async () => {
        await createSpan({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          type: SpanType.Tool,
          traceId: 'trace-tool-only',
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(0)
        expect(data.count).toBe(0)
      })
    })

    describe('project and document scoping', () => {
      it('should return 404 for commit from non-existent project', async () => {
        const request = buildRequest({
          projectId: '999999',
          commitUuid: '00000000-0000-0000-0000-000000000000',
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(404)
      })

      it('should return 404 for project from another workspace', async () => {
        const { project: otherProject, commit: otherCommit } =
          await createProject({
            documents: {
              'other-doc': 'Other content',
            },
          })

        const request = buildRequest({
          projectId: otherProject.id.toString(),
          commitUuid: otherCommit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(404)
      })

      it('should only return spans for the specified document', async () => {
        const { documents: otherDocuments, commit: otherCommit } =
          await createProject({
            workspace,
            documents: {
              'other-doc': 'Other content',
            },
          })
        const otherDocument = otherDocuments[0]!

        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          traceId: 'trace-correct-doc',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Correct document' }],
              toolCalls: [],
            },
          ],
        })

        await createPromptSpanWithCompletion({
          workspaceId: workspace.id,
          commitUuid: otherCommit.uuid,
          documentUuid: otherDocument.documentUuid,
          traceId: 'trace-other-doc',
          output: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Other document' }],
              toolCalls: [],
            },
          ],
        })

        const request = buildRequest({
          projectId: project.id.toString(),
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          configuration: buildConfiguration(),
        })

        const response = await GET(request, { workspace } as any)

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.items).toHaveLength(1)
        expect(data.items[0].actualOutput).toBe('Correct document')
      })
    })
  })
})
