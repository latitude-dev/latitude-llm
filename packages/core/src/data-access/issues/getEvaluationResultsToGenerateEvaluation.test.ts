import * as factories from '@latitude-data/core/factories'
import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { database } from '@latitude-data/core/client'
import { evaluationResultsV2 } from '@latitude-data/core/schema/models/evaluationResultsV2'
import { issueHistograms } from '@latitude-data/core/schema/models/issueHistograms'
import { format } from 'date-fns'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { SpanWithDetails } from '@latitude-data/constants'
import { SpanType } from '@latitude-data/constants'

import { getEvaluationResultsToGenerateEvaluationForIssue } from './getEvaluationResultsToGenerateEvaluation'

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
  issueId: number | null
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
    span: span as SpanWithDetails<SpanType.Prompt>,
    hasPassed,
  })
  if (issueId !== null && !hasPassed) {
    await database
      .update(evaluationResultsV2)
      .set({ issueId })
      .where(eq(evaluationResultsV2.id, result.id))
  }
  return result
}

describe('getEvaluationResultsToGenerateEvaluation', () => {
  let mockWorkspace: Workspace

  beforeEach(async () => {
    const { workspace } = await factories.createWorkspace({
      name: 'test',
    })
    mockWorkspace = workspace
  })

  it('should return correct counts when there are not enough negative annotations for this issue', async () => {
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

    const result = await getEvaluationResultsToGenerateEvaluationForIssue({
      workspace: setup.workspace,
      projectId: setup.project.id,
      commitUuid: setup.commit.uuid,
      issueId: setup.mainIssue.id,
      documentUuid: setup.documents[0]!.documentUuid,
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 3,
      positiveAndNegativeAnnotationsOfOtherIssues: 10,
    })
  })

  it('should return correct counts when there are not enough annotations for other issues', async () => {
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

    const result = await getEvaluationResultsToGenerateEvaluationForIssue({
      workspace: setup.workspace,
      projectId: setup.project.id,
      commitUuid: setup.commit.uuid,
      issueId: setup.mainIssue.id,
      documentUuid: setup.documents[0]!.documentUuid,
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 10,
      positiveAndNegativeAnnotationsOfOtherIssues: 3,
    })
  })

  it('should return correct counts when there are enough annotations', async () => {
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

    const result = await getEvaluationResultsToGenerateEvaluationForIssue({
      workspace: setup.workspace,
      projectId: setup.project.id,
      commitUuid: setup.commit.uuid,
      issueId: setup.mainIssue.id,
      documentUuid: setup.documents[0]!.documentUuid,
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 10,
      positiveAndNegativeAnnotationsOfOtherIssues: 10,
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

    const result = await getEvaluationResultsToGenerateEvaluationForIssue({
      workspace: setup.workspace,
      projectId: setup.project.id,
      commitUuid: setup.commit.uuid,
      issueId: setup.mainIssue.id,
      documentUuid: setup.documents[0]!.documentUuid,
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 5, // Only negative ones
      positiveAndNegativeAnnotationsOfOtherIssues: 13, // 10 annotations for other issues + 3 positive annotations for the main issue
    })
  })

  it('should include positive results for document from issues not in the filtered list', async () => {
    const setup = await setupTestProject(mockWorkspace)

    // Create 10 negative annotations for the main issue
    for (let i = 0; i < 10; i++) {
      await createEvaluationResultWithIssue({
        setup,
        issueId: setup.mainIssue.id,
        hasPassed: false,
      })
    }

    // Create 3 annotations for other issues (from the 5 we fetch)
    for (let i = 0; i < 3; i++) {
      await createEvaluationResultWithIssue({
        setup,
        issueId: setup.otherIssues[i]!.id,
        hasPassed: true,
      })
    }

    // Create an additional issue from the same document (not in the filtered list)
    const { issue: additionalIssue } = await factories.createIssue({
      workspace: setup.workspace,
      project: setup.project,
      document: setup.documents[0]!,
    })

    // Create histogram for additional issue
    await database.insert(issueHistograms).values({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
      documentUuid: setup.documents[0]!.documentUuid,
      issueId: additionalIssue.id,
      commitId: setup.commit.id,
      date: format(new Date(), 'yyyy-MM-dd'),
      count: 1,
    })

    // Create 5 positive results for the document from this additional issue
    // These should be included via listPositiveResultsForDocument
    for (let i = 0; i < 5; i++) {
      await createEvaluationResultWithIssue({
        setup,
        issueId: additionalIssue.id,
        hasPassed: true,
      })
    }

    const result = await getEvaluationResultsToGenerateEvaluationForIssue({
      workspace: setup.workspace,
      projectId: setup.project.id,
      commitUuid: setup.commit.uuid,
      issueId: setup.mainIssue.id,
      documentUuid: setup.documents[0]!.documentUuid,
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 10,
      positiveAndNegativeAnnotationsOfOtherIssues: 8,
    })
  })

  it('should throw error when project is not found', async () => {
    const setup = await setupTestProject(mockWorkspace)

    await expect(
      getEvaluationResultsToGenerateEvaluationForIssue({
        workspace: setup.workspace,
        projectId: 99999,
        commitUuid: setup.commit.uuid,
        issueId: setup.mainIssue.id,
        documentUuid: setup.documents[0]!.documentUuid,
      }),
    ).rejects.toThrow()
  })

  it('should throw error when commit is not found', async () => {
    const setup = await setupTestProject(mockWorkspace)

    await expect(
      getEvaluationResultsToGenerateEvaluationForIssue({
        workspace: setup.workspace,
        projectId: setup.project.id,
        commitUuid: 'non-existent-uuid',
        issueId: setup.mainIssue.id,
        documentUuid: setup.documents[0]!.documentUuid,
      }),
    ).rejects.toThrow()
  })
})
