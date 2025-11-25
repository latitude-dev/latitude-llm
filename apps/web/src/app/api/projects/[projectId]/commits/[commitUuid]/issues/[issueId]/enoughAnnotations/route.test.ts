import * as factories from '@latitude-data/core/factories'
import { Providers } from '@latitude-data/constants'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { database } from '@latitude-data/core/client'
import { evaluationResultsV2 } from '@latitude-data/core/schema/models/evaluationResultsV2'
import { issueHistograms } from '@latitude-data/core/schema/models/issueHistograms'
import { randomUUID } from 'crypto'
import { format } from 'date-fns'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'

import { GET } from './route'
import { User } from '@latitude-data/core/schema/models/types/User'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

type TestSetup = {
  workspace: Workspace
  project: Awaited<ReturnType<typeof factories.createProject>>['project']
  commit: Awaited<ReturnType<typeof factories.createProject>>['commit']
  documents: Awaited<ReturnType<typeof factories.createProject>>['documents']
  apiKeys: Awaited<ReturnType<typeof factories.createProject>>['apiKeys']
  evaluation: Awaited<ReturnType<typeof factories.createEvaluationV2>>
  mainIssue: Issue
  otherIssues: Issue[]
}

async function setupTestProject(workspace: Workspace): Promise<TestSetup> {
  const {
    workspace: w,
    project,
    commit,
    documents,
    apiKeys,
  } = await factories.createProject({
    workspace,
    providers: [{ type: Providers.OpenAI, name: 'openai' }],
    documents: {
      prompt: factories.helpers.createPrompt({
        provider: 'openai',
        model: 'gpt-4o',
      }),
    },
  })

  const evaluation = await factories.createEvaluationV2({
    document: documents[0]!,
    commit: commit,
    workspace: w,
  })

  // Create the main issue
  const { issue: mainIssue } = await factories.createIssue({
    workspace: w,
    project,
    document: documents[0]!,
  })

  // Create histogram for main issue
  await database.insert(issueHistograms).values({
    workspaceId: w.id,
    projectId: project.id,
    documentUuid: documents[0]!.documentUuid,
    issueId: mainIssue.id,
    commitId: commit.id,
    date: format(new Date(), 'yyyy-MM-dd'),
    count: 1,
  })

  // Create 5 other issues
  const otherIssues: Issue[] = []
  for (let i = 0; i < 5; i++) {
    const { issue } = await factories.createIssue({
      workspace: w,
      project,
      document: documents[0]!,
    })
    otherIssues.push(issue)

    // Create histogram for each issue
    await database.insert(issueHistograms).values({
      workspaceId: w.id,
      projectId: project.id,
      documentUuid: documents[0]!.documentUuid,
      issueId: issue.id,
      commitId: commit.id,
      date: format(new Date(), 'yyyy-MM-dd'),
      count: 1,
    })
  }

  return {
    workspace: w,
    project,
    commit,
    documents,
    apiKeys,
    evaluation,
    mainIssue,
    otherIssues,
  }
}

async function createEvaluationResultWithIssue({
  setup,
  issueId,
  hasPassed,
}: {
  setup: TestSetup
  issueId: number
  hasPassed: boolean
}) {
  const span = await factories.createSpan({
    workspaceId: setup.workspace.id,
    commitUuid: setup.commit.uuid,
    apiKeyId: setup.apiKeys[0]?.id,
  })
  const result = await factories.createEvaluationResultV2({
    workspace: setup.workspace,
    evaluation: setup.evaluation,
    commit: setup.commit,
    span: span as any,
    hasPassed,
  })
  await database
    .update(evaluationResultsV2)
    .set({ issueId })
    .where(eq(evaluationResultsV2.id, result.id))
  return result
}

describe('GET handler for enoughAnnotations', () => {
  let mockRequest: NextRequest
  let mockWorkspace: Workspace
  let mockUser: User

  beforeEach(async () => {
    mockRequest = new NextRequest(
      'http://localhost:3000/api/projects/1/commits/uuid/issues/1/enoughAnnotations',
    )
    const { workspace, userData } = await factories.createWorkspace({
      name: 'test',
    })
    mockUser = userData
    mockWorkspace = workspace
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      mocks.getSession.mockResolvedValue(null)

      const response = await GET(mockRequest, {
        params: { projectId: '1', commitUuid: 'uuid', issueId: '1' },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user: mockUser,
        session: { userId: mockUser.id, currentWorkspaceId: mockWorkspace.id },
      })
    })

    it('should return 404 when project is not found', async () => {
      const response = await GET(mockRequest, {
        params: { projectId: '999', commitUuid: 'uuid', issueId: '1' },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        }),
      )
    })

    it('should return 404 when commit is not found', async () => {
      const { project } = await factories.createProject({
        workspace: mockWorkspace,
      })

      const response = await GET(mockRequest, {
        params: {
          projectId: project.id.toString(),
          commitUuid: randomUUID(),
          issueId: '1',
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        }),
      )
    })

    it('should return hasEnoughAnnotations false when there are not enough negative annotations for this issue', async () => {
      const setup = await setupTestProject(mockWorkspace)

      // Create only 3 negative annotations for the main issue (need 5)
      for (let i = 0; i < 3; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
      }

      // Create 10 positive annotations for other issues (need 5)
      for (let i = 0; i < 10; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i % 5]!.id,
          hasPassed: true,
        })
      }

      const response = await GET(mockRequest, {
        params: {
          projectId: setup.project.id.toString(),
          commitUuid: setup.commit.uuid,
          issueId: setup.mainIssue.id.toString(),
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        issueId: setup.mainIssue.id,
        negativeAnnotationsOfThisIssue: 3,
        positiveOrOtherNegativeAnnotationsOfOtherIssues: 10,
        hasEnoughAnnotations: false,
      })
    })

    it('should return hasEnoughAnnotations false when there are not enough annotations for other issues', async () => {
      const setup = await setupTestProject(mockWorkspace)

      // Create 10 negative annotations for the main issue (need 5)
      for (let i = 0; i < 10; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
      }

      // Create only 3 annotations for other issues (need 5)
      for (let i = 0; i < 3; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i]!.id,
          hasPassed: true,
        })
      }

      const response = await GET(mockRequest, {
        params: {
          projectId: setup.project.id.toString(),
          commitUuid: setup.commit.uuid,
          issueId: setup.mainIssue.id.toString(),
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        issueId: setup.mainIssue.id,
        negativeAnnotationsOfThisIssue: 10,
        positiveOrOtherNegativeAnnotationsOfOtherIssues: 3,
        hasEnoughAnnotations: false,
      })
    })

    it('should return hasEnoughAnnotations true when there are enough annotations', async () => {
      const setup = await setupTestProject(mockWorkspace)

      // Create 10 negative annotations for the main issue (need 5)
      for (let i = 0; i < 10; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
      }

      // Create 10 annotations for other issues (need 5)
      for (let i = 0; i < 10; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i % 5]!.id,
          hasPassed: i % 2 === 0, // Mix of positive and negative
        })
      }

      const response = await GET(mockRequest, {
        params: {
          projectId: setup.project.id.toString(),
          commitUuid: setup.commit.uuid,
          issueId: setup.mainIssue.id.toString(),
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        issueId: setup.mainIssue.id,
        negativeAnnotationsOfThisIssue: 10,
        positiveOrOtherNegativeAnnotationsOfOtherIssues: 10,
        hasEnoughAnnotations: true,
      })
    })

    it('should correctly count only negative annotations for the main issue', async () => {
      const setup = await setupTestProject(mockWorkspace)

      // Create 5 negative annotations for the main issue
      for (let i = 0; i < 5; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
      }

      // Create 3 positive annotations for the main issue (should not be counted)
      for (let i = 0; i < 3; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: true,
        })
      }

      // Create 10 annotations for other issues
      for (let i = 0; i < 10; i++) {
        await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i % 5]!.id,
          hasPassed: true,
        })
      }

      const response = await GET(mockRequest, {
        params: {
          projectId: setup.project.id.toString(),
          commitUuid: setup.commit.uuid,
          issueId: setup.mainIssue.id.toString(),
        },
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        issueId: setup.mainIssue.id,
        negativeAnnotationsOfThisIssue: 5, // Only negative ones
        positiveOrOtherNegativeAnnotationsOfOtherIssues: 10,
        hasEnoughAnnotations: true,
      })
    })
  })
})
