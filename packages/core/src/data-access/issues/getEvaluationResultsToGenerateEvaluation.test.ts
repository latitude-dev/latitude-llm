import * as factories from '../../tests/factories'
import { HumanEvaluationMetric, Providers } from '@latitude-data/constants'
import { EvaluationType } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { database } from '../../client'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { format } from 'date-fns'
import type { Issue } from '../../schema/models/types/Issue'
import { Workspace } from '../../schema/models/types/Workspace'
import type { SpanWithDetails } from '@latitude-data/constants'
import { SpanType } from '@latitude-data/constants'

import { getEvaluationResultsToGenerateEvaluationForIssue } from './getEvaluationResultsToGenerateEvaluation'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { issueEvaluationResults } from '../../schema/models/issueEvaluationResults'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { User } from '../../schema/models/types/User'
import {
  MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE,
  MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES,
} from '../../constants'

type TestSetup = {
  workspace: Workspace
  project: Awaited<ReturnType<typeof factories.createProject>>['project']
  commit: Awaited<ReturnType<typeof factories.createProject>>['commit']
  documents: Awaited<ReturnType<typeof factories.createProject>>['documents']
  apiKeys: Awaited<ReturnType<typeof factories.createProject>>['apiKeys']
  evaluation: Awaited<ReturnType<typeof factories.createEvaluationV2>>
  mainIssue: Issue
  otherIssues: Issue[]
  user: User
}

async function setupTestProject(workspace: Workspace): Promise<TestSetup> {
  const {
    workspace: w,
    project,
    commit,
    documents,
    apiKeys,
    user,
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
    type: EvaluationType.Human,
    metric: HumanEvaluationMetric.Rating,
    configuration: {
      reverseScale: false,
      actualOutput: {
        messageSelection: 'last',
        parsingFormat: 'string',
      },
      expectedOutput: {
        parsingFormat: 'string',
      },
      criteria: 'criteria',
      minRating: 1,
      minRatingDescription: 'min description',
      maxRating: 5,
      maxRatingDescription: 'max description',
      minThreshold: 3,
    },
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
    user,
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
  // Only update evaluation version issueId if this is a failed result
  // For passed results, we don't need to set issueId on the evaluation version
  if (issueId !== null && !hasPassed) {
    await database
      .update(evaluationVersions)
      .set({ issueId })
      .where(eq(evaluationVersions.evaluationUuid, setup.evaluation.uuid))
  }
  const result = await factories.createEvaluationResultV2({
    workspace: setup.workspace,
    evaluation: setup.evaluation,
    commit: setup.commit,
    span: span as SpanWithDetails<SpanType.Prompt>,
    hasPassed,
  })
  if (issueId !== null && !hasPassed) {
    // Cant wait for the job to run, so we insert the issue evaluation result directly
    await database.insert(issueEvaluationResults).values({
      workspaceId: setup.workspace.id,
      issueId,
      evaluationResultId: result.id,
    })
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
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 3,
      passedEvaluationResults: 6, // Limited by pagination (6 passed results max)
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
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 6, // Limited by pagination (6 negative results max)
      passedEvaluationResults: 3,
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
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue:
        MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE + 1, // Limited by pagination (10 negative results max)
      passedEvaluationResults:
        MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES + 1, // Limited by pagination (10 passed results max)
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
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue: 5, // Only negative ones
      passedEvaluationResults:
        MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES + 1, // Limited by pagination (6 passed results max)
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
    })

    expect(result).toEqual({
      negativeAnnotationsOfThisIssue:
        MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE + 1, // Limited by pagination (6 negative results max)
      passedEvaluationResults:
        MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES + 1, // Limited by pagination (6 passed results max)
    })
  })

  it('should throw error when commit is not found', async () => {
    const setup = await setupTestProject(mockWorkspace)

    await expect(
      getEvaluationResultsToGenerateEvaluationForIssue({
        workspace: setup.workspace,
        projectId: setup.project.id,
        commitUuid: 'non-existent-uuid',
        issueId: setup.mainIssue.id,
      }),
    ).rejects.toThrow()
  })

  describe('commit history filtering', () => {
    it('should only count annotations from commits in the commit history', async () => {
      const setup = await setupTestProject(mockWorkspace)

      // Create commits with dates AFTER setup.commit so the evaluation is visible in their history
      const now = new Date()

      const commit1 = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
        mergedAt: new Date(now.getTime() + 1000),
      })

      // Create second merged commit (more recent)
      const commit2 = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
        mergedAt: new Date(now.getTime() + 2000),
      })

      const commit3 = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
        mergedAt: new Date(now.getTime() + 3000),
      })

      // Create 5 negative annotations for main issue in commit1 (should be counted)
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
        // Update to be in commit1
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit1.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 negative annotations for main issue in commit2 (should be counted)
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
        // Update to be in commit2
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit2.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 negative annotations for main issue in commit3 (should NOT be counted when querying commit2)
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
        // Update to be in commit3
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit3.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 positive annotations for other issues in commit1 (should be counted)
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i % 5]!.id,
          hasPassed: true,
        })
        // Update to be in commit1
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit1.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 positive annotations for other issues in commit3 (should NOT be counted when querying commit2)
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i % 5]!.id,
          hasPassed: true,
        })
        // Update to be in commit3
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit3.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Query with commit2 - should only count annotations from commit1 and commit2
      const result = await getEvaluationResultsToGenerateEvaluationForIssue({
        workspace: setup.workspace,
        projectId: setup.project.id,
        commitUuid: commit2.uuid,
        issueId: setup.mainIssue.id,
      })

      expect(result).toEqual({
        negativeAnnotationsOfThisIssue:
          MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE + 1, // Limited by pagination (MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE + 1 negative results max)
        passedEvaluationResults: 5, // 5 from commit1 (not commit3)
      })
    })

    it('should include draft commit and all previous merged commits', async () => {
      const setup = await setupTestProject(mockWorkspace)

      // Create merged commits
      const commit1 = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
        mergedAt: new Date('2024-01-01'),
      })

      const commit2 = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
        mergedAt: new Date('2024-01-02'),
      })

      // Create draft commit (mergedAt = null)
      const draftCommit = await factories.createCommit({
        projectId: setup.project.id,
        user: setup.user,
        mergedAt: null,
      })

      // Create 5 negative annotations for main issue in commit1
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit1.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 negative annotations for main issue in commit2
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit2.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 negative annotations for main issue in draft commit
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.mainIssue.id,
          hasPassed: false,
        })
        await database
          .update(evaluationResultsV2)
          .set({ commitId: draftCommit.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 positive annotations for other issues in commit1
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i]!.id,
          hasPassed: true,
        })
        await database
          .update(evaluationResultsV2)
          .set({ commitId: commit1.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Create 5 positive annotations for other issues in draft commit
      for (let i = 0; i < 5; i++) {
        const result = await createEvaluationResultWithIssue({
          setup,
          issueId: setup.otherIssues[i]!.id,
          hasPassed: true,
        })
        await database
          .update(evaluationResultsV2)
          .set({ commitId: draftCommit.id })
          .where(eq(evaluationResultsV2.id, result.id))
      }

      // Query with draft commit - should include all commits (draft + all merged)
      const result = await getEvaluationResultsToGenerateEvaluationForIssue({
        workspace: setup.workspace,
        projectId: setup.project.id,
        commitUuid: draftCommit.uuid,
        issueId: setup.mainIssue.id,
      })

      expect(result).toEqual({
        negativeAnnotationsOfThisIssue:
          MINIMUM_NEGATIVE_ANNOTATIONS_FOR_THIS_ISSUE + 1, // Limited by pagination (15 negative results max)
        passedEvaluationResults:
          MINIMUM_POSITIVE_OR_OTHER_NEGATIVE_ANNOTATIONS_FOR_OTHER_ISSUES + 1, // Limited by pagination (6 passed results max)
      })
    })
  })
})
