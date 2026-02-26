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
import { computeDocumentTracesDailyCount } from './computeDocumentTracesDailyCount'

describe('computeDocumentTracesDailyCount', () => {
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

  it('returns daily counts for spans matching commitUuids', async () => {
    const today = new Date()

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-1',
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      startedAt: today,
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-2',
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      type: SpanType.Prompt,
      startedAt: today,
    })

    const result = await computeDocumentTracesDailyCount({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid],
    })

    expect(result.ok).toBe(true)
    const rows = result.unwrap()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const todayRow = rows.find(
      (r) => r.date === today.toISOString().split('T')[0],
    )
    expect(todayRow).toBeDefined()
    expect(todayRow!.count).toBe(2)
  })

  it('excludes spans from commits not in the commitUuids list', async () => {
    const today = new Date()

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
      type: SpanType.Prompt,
      startedAt: today,
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-excluded',
      documentUuid: document.documentUuid,
      commitUuid: otherCommitUuid,
      type: SpanType.Prompt,
      startedAt: today,
    })

    const result = await computeDocumentTracesDailyCount({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid],
    })

    expect(result.ok).toBe(true)
    const rows = result.unwrap()
    const todayRow = rows.find(
      (r) => r.date === today.toISOString().split('T')[0],
    )
    expect(todayRow).toBeDefined()
    expect(todayRow!.count).toBe(1)
  })

  it('includes spans from multiple commits when all are in commitUuids', async () => {
    const today = new Date()

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
      type: SpanType.Prompt,
      startedAt: today,
    })

    await createSpan({
      workspaceId: workspace.id,
      traceId: 'trace-commit2',
      documentUuid: document.documentUuid,
      commitUuid: secondCommitUuid,
      type: SpanType.Prompt,
      startedAt: today,
    })

    const result = await computeDocumentTracesDailyCount({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid, secondCommitUuid],
    })

    expect(result.ok).toBe(true)
    const rows = result.unwrap()
    const todayRow = rows.find(
      (r) => r.date === today.toISOString().split('T')[0],
    )
    expect(todayRow).toBeDefined()
    expect(todayRow!.count).toBe(2)
  })

  it('returns empty array when no spans match', async () => {
    const result = await computeDocumentTracesDailyCount({
      workspaceId: workspace.id,
      projectId: commit.projectId,
      documentUuid: document.documentUuid,
      commitUuids: [commit.uuid],
    })

    expect(result.ok).toBe(true)
    const rows = result.unwrap()
    expect(rows).toHaveLength(0)
  })
})
