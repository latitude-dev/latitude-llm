import { LogSources, RunSourceGroup } from '@latitude-data/constants'
import { beforeAll, describe, expect, it } from 'vitest'
import * as factories from '../../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../../tests/factories'
import { listCompletedRuns } from './listCompleted'

let setup: FactoryCreateProjectReturn

describe('listCompletedRuns', () => {
  beforeAll(async () => {
    setup = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: 'openai' as any,
        },
      ],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })
  })

  it('returns empty array when no completed runs exist', async () => {
    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value!.items).toEqual([])
  })

  it('lists completed runs', async () => {
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    await factories.createSpan({
      workspaceId: setup.workspace.id,
      documentLogUuid: log1.uuid,
      documentUuid: setup.documents[0]!.documentUuid,
      commitUuid: setup.commit.uuid,
      source: LogSources.Playground,
    })

    const { documentLog: log2 } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    await factories.createSpan({
      workspaceId: setup.workspace.id,
      documentLogUuid: log2.uuid,
      documentUuid: setup.documents[0]!.documentUuid,
      commitUuid: setup.commit.uuid,
      source: LogSources.Playground,
    })

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()

    expect(value.items.length).toBeGreaterThanOrEqual(2)
    const uuids = value.items.map((r) => r.span.documentLogUuid)
    expect(uuids).toContain(log1.uuid)
    expect(uuids).toContain(log2.uuid)
  })

  it('includes all required fields for completed runs', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    await factories.createSpan({
      workspaceId: setup.workspace.id,
      documentLogUuid: documentLog.uuid,
      documentUuid: setup.documents[0]!.documentUuid,
      commitUuid: setup.commit.uuid,
      source: LogSources.Playground,
    })

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    const run = value.items.find(
      (r) => r.span.documentLogUuid === documentLog.uuid,
    )
    expect(run).toBeDefined()
    if (!run) return

    // Verify all required fields are present
    expect(run.queuedAt).toBeInstanceOf(Date)
    expect(run.startedAt).toBeInstanceOf(Date)
    expect(run.endedAt).toBeInstanceOf(Date)
    expect(typeof run.caption).toBe('string')
    expect(run.span).toBeDefined()
    expect(Array.isArray(run.annotations)).toBe(true)
    expect(run.source).toBeDefined()
  })

  it('filters by sourceGroup - Playground', async () => {
    // Create runs with different sources
    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
    })

    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
      sourceGroup: RunSourceGroup.Playground,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    // All runs should be from Playground source
    expect(value.items.every((r) => r.source === LogSources.Playground)).toBe(
      true,
    )
  })

  it('filters by sourceGroup - Production', async () => {
    // Create runs with production sources
    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
    })

    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Experiment,
    })

    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground, // Not production
    })

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
      sourceGroup: RunSourceGroup.Production,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    // All runs should be from production sources (API or Experiment)
    expect(
      value.items.every(
        (r) =>
          r.source === LogSources.API || r.source === LogSources.Experiment,
      ),
    ).toBe(true)
  })
})
