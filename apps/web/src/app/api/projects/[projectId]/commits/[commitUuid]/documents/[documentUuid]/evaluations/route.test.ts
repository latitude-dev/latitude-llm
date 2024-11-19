import { Providers } from '@latitude-data/core/browser'
import * as factories from '@latitude-data/core/factories'
import { Result } from '@latitude-data/core/lib/Result'
import { ConnectedEvaluationsRepository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from './route'

vi.mock('@latitude-data/core/repositories', async (importOriginal) => {
  const original = await importOriginal()
  return {
    // @ts-expect-error
    ...original,
    ConnectedEvaluationsRepository: vi.fn(),
  }
})
vi.mock('$/middlewares/authHandler', () => ({
  authHandler: (fn: Function) => fn,
}))

describe('GET /api/documents/[projectId]/[commitUuid]/[documentUuid]/evaluations', async () => {
  let workspace: any
  let documents: any
  let mockEvaluations: any

  beforeEach(async () => {
    vi.resetAllMocks()

    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        doc1: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo',
        }),
        doc2: factories.helpers.createPrompt({
          provider: 'openai',
          content: 'bar',
        }),
      },
    })

    workspace = setup.workspace
    documents = setup.documents

    mockEvaluations = [
      await factories.createConnectedEvaluation({
        workspace,
        user: setup.user,
        documentUuid: documents[0]!.documentUuid,
      }),
      await factories.createConnectedEvaluation({
        workspace,
        user: setup.user,
        documentUuid: documents[1]!.documentUuid,
      }),
    ]
  })

  it('should return evaluations for the given document UUID', async () => {
    const mockFilterByDocumentUuid = vi
      .fn()
      .mockResolvedValue(Result.ok(mockEvaluations))
    vi.mocked(ConnectedEvaluationsRepository).mockImplementation(
      () =>
        ({
          filterByDocumentUuid: mockFilterByDocumentUuid,
        }) as any,
    )

    const request = new NextRequest(
      'http://localhost/api/documents/test-project/test-commit/test-document-uuid/evaluations',
    )
    const response = await GET(request, {
      params: { documentUuid: documents[0]!.documentUuid },
      workspace,
    })

    expect(ConnectedEvaluationsRepository).toHaveBeenCalledWith(workspace.id)
    expect(mockFilterByDocumentUuid).toHaveBeenCalledWith(
      documents[0]!.documentUuid,
    )
    expect(response).toBeInstanceOf(NextResponse)
    // @ts-expect-error
    expect((await response.json()).map((ev) => ev.id)).toEqual(
      // @ts-expect-error
      mockEvaluations.map((ev) => ev.id),
    )
    expect(response.status).toBe(200)
  })

  it('should handle errors when fetching evaluations fails', async () => {
    const mockError = new Error('Failed to fetch evaluations')
    const mockFilterByDocumentUuid = vi
      .fn()
      .mockResolvedValue(Result.error(mockError))
    vi.mocked(ConnectedEvaluationsRepository).mockImplementation(
      () =>
        ({
          filterByDocumentUuid: mockFilterByDocumentUuid,
        }) as any,
    )

    const request = new NextRequest(
      'http://localhost/api/documents/test-project/test-commit/test-document-uuid/evaluations',
    )
    const response = await GET(request, {
      params: { documentUuid: documents[0]!.documentUuid },
      workspace,
    })

    expect(ConnectedEvaluationsRepository).toHaveBeenCalledWith(workspace.id)
    expect(mockFilterByDocumentUuid).toHaveBeenCalledWith(
      documents[0]!.documentUuid,
    )
    expect(response).toBeInstanceOf(NextResponse)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      message: 'Internal Server Error',
    })
  })
})
