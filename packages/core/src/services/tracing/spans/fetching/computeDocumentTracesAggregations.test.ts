import { SpanType } from '@latitude-data/constants'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Commit } from '../../../../schema/models/types/Commit'
import type { DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import type { User } from '../../../../schema/models/types/User'
import type { Workspace } from '../../../../schema/models/types/Workspace'
import {
  createCommit,
  createProject,
  createSpan,
} from '../../../../tests/factories'
import { computeDocumentTracesAggregations } from './computeDocumentTracesAggregations'

describe('computeDocumentTracesAggregations', () => {
  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let user: User

  beforeEach(async () => {
    const setup = await createProject({
      documents: { 'test-doc': 'Test content' },
    })
    workspace = setup.workspace
    commit = setup.commit
    document = setup.documents[0]!
    user = setup.user
  })

  it('returns aggregations for spans matching commitUuids', async () => {
    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-1',
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Completion,
      tokensPrompt: 10,
      tokensCompletion: 20,
      cost: 100,
      duration: 500,
    })

    const result = await computeDocumentTracesAggregations({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid],
    })

    expect(result.ok).toBe(true)
    const agg = result.unwrap()
    expect(agg.totalCount).toBe(1)
    expect(agg.totalTokens).toBe(30)
    expect(agg.totalCostInMillicents).toBe(100)
  })

  it('excludes spans from commits not in the commitUuids list', async () => {
    const { uuid: otherCommitUuid } = await createCommit({
      projectId: commit.projectId,
      user,
      mergedAt: new Date(),
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-included',
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Completion,
      tokensPrompt: 10,
      tokensCompletion: 5,
      cost: 50,
      duration: 200,
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-excluded',
      documentUuid: document.documentUuid,
      commitUuid: otherCommitUuid,
      type: SpanType.Completion,
      tokensPrompt: 100,
      tokensCompletion: 100,
      cost: 9999,
      duration: 9999,
    })

    const result = await computeDocumentTracesAggregations({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid],
    })

    expect(result.ok).toBe(true)
    const agg = result.unwrap()
    expect(agg.totalCount).toBe(1)
    expect(agg.totalTokens).toBe(15)
    expect(agg.totalCostInMillicents).toBe(50)
  })

  it('includes spans from multiple commits when all are in commitUuids', async () => {
    const { uuid: secondCommitUuid } = await createCommit({
      projectId: commit.projectId,
      user,
      mergedAt: new Date(),
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-commit1',
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Completion,
      tokensPrompt: 10,
      tokensCompletion: 10,
      cost: 50,
      duration: 100,
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-commit2',
      documentUuid: document.documentUuid,
      commitUuid: secondCommitUuid,
      type: SpanType.Completion,
      tokensPrompt: 20,
      tokensCompletion: 20,
      cost: 70,
      duration: 200,
    })

    const result = await computeDocumentTracesAggregations({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid, secondCommitUuid],
    })

    expect(result.ok).toBe(true)
    const agg = result.unwrap()
    expect(agg.totalCount).toBe(2)
    expect(agg.totalTokens).toBe(60)
    expect(agg.totalCostInMillicents).toBe(120)
  })

  it('returns zeros when no spans match', async () => {
    const result = await computeDocumentTracesAggregations({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid],
    })

    expect(result.ok).toBe(true)
    const agg = result.unwrap()
    expect(agg.totalCount).toBe(0)
    expect(agg.totalTokens).toBe(0)
    expect(agg.totalCostInMillicents).toBe(0)
    expect(agg.averageTokens).toBe(0)
    expect(agg.averageCostInMillicents).toBe(0)
    expect(agg.averageDuration).toBe(0)
  })
})
