import { describe, it, expect, beforeEach } from 'vitest'
import { SpanType } from '@latitude-data/constants'
import { Result } from '@latitude-data/core/lib/Result'
import { __test__ as generateEvaluationFromIssueTest } from './generateEvaluationFromIssue'
import * as factories from '../../../tests/factories'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { Issue } from '@latitude-data/core/schema/models/types/Issue'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  createEvaluationResultV2,
  createEvaluationV2,
  createIssueEvaluationResult,
  createSpan,
} from '../../../tests/factories'
import { Span, SpanWithDetails } from '@latitude-data/constants'

describe('getEqualAmountsOfPositiveAndNegativeEvaluationResults', () => {
  let workspace: Workspace
  let commit: Commit
  let issue: Issue
  let document: DocumentVersion

  beforeEach(async () => {
    const projectData = await factories.createProject({
      documents: {
        'test-doc': 'Test content',
      },
    })
    workspace = projectData.workspace
    commit = projectData.commit
    document = projectData.documents[0]!

    const issueData = await factories.createIssue({
      document,
      workspace,
    })
    issue = issueData.issue
  })

  it('returns equal amounts when positive and negative spans are equal', async () => {
    const evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
    })

    // Create 3 spans with issues (positive)
    const positiveSpans = []
    for (let i = 0; i < 3; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-positive-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      positiveSpans.push(span)
    }

    // Create 3 spans without issues (negative)
    const negativeSpans = []
    for (let i = 0; i < 3; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-negative-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })
      negativeSpans.push(span)
    }

    const result =
      await generateEvaluationFromIssueTest.getEqualAmountsOfPositiveAndNegativeEvaluationResults(
        {
          workspace,
          commit,
          issue,
        },
      )

    expect(Result.isOk(result)).toBe(true)
    const { positiveEvaluationResults, negativeEvaluationResults } =
      result.unwrap()
    expect(positiveEvaluationResults).toHaveLength(3)
    expect(negativeEvaluationResults).toHaveLength(3)
    // Check that all positive spans are present (order may vary)
    expect(positiveEvaluationResults.map((s: Span) => s.id).sort()).toEqual(
      positiveSpans.map((s) => s.id).sort(),
    )
    // Check that all negative spans are present (order may vary)
    expect(negativeEvaluationResults.map((s: Span) => s.id).sort()).toEqual(
      negativeSpans.map((s) => s.id).sort(),
    )
  })

  it('returns equal amounts when negative spans are less than positive spans', async () => {
    const evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
    })

    // Create 5 spans with issues (positive)
    const positiveSpans = []
    for (let i = 0; i < 5; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-positive-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      positiveSpans.push(span)
    }

    // Create only 2 spans without issues (negative)
    const negativeSpans = []
    for (let i = 0; i < 2; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-negative-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })
      negativeSpans.push(span)
    }

    const result =
      await generateEvaluationFromIssueTest.getEqualAmountsOfPositiveAndNegativeEvaluationResults(
        {
          workspace,
          commit,
          issue,
        },
      )

    expect(Result.isOk(result)).toBe(true)
    const { positiveEvaluationResults, negativeEvaluationResults } =
      result.unwrap()
    // Both should have the same length (minimum of 5 and 2 = 2)
    expect(positiveEvaluationResults).toHaveLength(2)
    expect(negativeEvaluationResults).toHaveLength(2)
    // Check that positive spans are a subset (first 2 of 5)
    expect(positiveEvaluationResults).toHaveLength(2)
    const positiveSpanIds = positiveSpans.map((s) => s.id)
    positiveEvaluationResults.forEach((span: Span) => {
      expect(positiveSpanIds).toContain(span.id)
    })
    // Check that all negative spans are present (order may vary)
    expect(negativeEvaluationResults.map((s: Span) => s.id).sort()).toEqual(
      negativeSpans.map((s) => s.id).sort(),
    )
  })

  it('returns equal amounts when negative spans are more than positive spans', async () => {
    const evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
    })

    // Create 3 spans with issues (positive)
    const positiveSpans = []
    for (let i = 0; i < 3; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-positive-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      positiveSpans.push(span)
    }

    // Create 5 spans without issues (negative)
    const negativeSpans = []
    for (let i = 0; i < 5; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-negative-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })
      negativeSpans.push(span)
    }

    const result =
      await generateEvaluationFromIssueTest.getEqualAmountsOfPositiveAndNegativeEvaluationResults(
        {
          workspace,
          commit,
          issue,
        },
      )

    expect(Result.isOk(result)).toBe(true)
    const { positiveEvaluationResults, negativeEvaluationResults } =
      result.unwrap()
    expect(positiveEvaluationResults).toHaveLength(3)
    expect(negativeEvaluationResults).toHaveLength(3) // Limited to match positive
    // Check that all positive spans are present (order may vary)
    expect(positiveEvaluationResults.map((s: Span) => s.id).sort()).toEqual(
      positiveSpans.map((s) => s.id).sort(),
    )
    // Check that negative spans are a subset of all negative spans (order may vary)
    // The function may return any 3 negative spans, not necessarily the first 3
    expect(negativeEvaluationResults).toHaveLength(3)
    const negativeSpanIds = negativeSpans.map((s) => s.id)
    negativeEvaluationResults.forEach((span: Span) => {
      expect(negativeSpanIds).toContain(span.id)
    })
  })

  it('returns empty arrays when no spans exist', async () => {
    const result =
      await generateEvaluationFromIssueTest.getEqualAmountsOfPositiveAndNegativeEvaluationResults(
        {
          workspace,
          commit,
          issue,
        },
      )

    expect(Result.isOk(result)).toBe(true)
    const { positiveEvaluationResults, negativeEvaluationResults } =
      result.unwrap()
    expect(positiveEvaluationResults).toHaveLength(0)
    expect(negativeEvaluationResults).toHaveLength(0)
  })

  it('returns empty arrays when no negative spans exist', async () => {
    const evaluation = await createEvaluationV2({
      workspace,
      document,
      commit,
    })

    // Create 3 spans with issues (positive)
    const positiveSpans = []
    for (let i = 0; i < 3; i++) {
      const span = await createSpan({
        workspaceId: workspace.id,
        traceId: `trace-positive-${i}`,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        type: SpanType.Prompt,
      })

      const evalResult = await createEvaluationResultV2({
        workspace,
        evaluation,
        commit,
        span: {
          ...span,
          type: SpanType.Prompt,
        } as unknown as SpanWithDetails<SpanType.Prompt>,
      })

      await createIssueEvaluationResult({
        workspace,
        issue,
        evaluationResult: evalResult,
      })

      positiveSpans.push(span)
    }

    // All spans in document have issues, so no negative spans

    const result =
      await generateEvaluationFromIssueTest.getEqualAmountsOfPositiveAndNegativeEvaluationResults(
        {
          workspace,
          commit,
          issue,
        },
      )

    expect(Result.isOk(result)).toBe(true)
    const { positiveEvaluationResults, negativeEvaluationResults } =
      result.unwrap()
    // Both should be empty (minimum of 3 and 0 = 0)
    expect(positiveEvaluationResults).toHaveLength(0)
    expect(negativeEvaluationResults).toHaveLength(0)
  })
})
