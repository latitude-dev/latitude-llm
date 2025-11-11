import { LogSources, RunSourceGroup } from '@latitude-data/constants'
import { DEFAULT_PAGINATION_SIZE } from '../../../constants'
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

    expect(result.value).toEqual([])
  })

  it('lists completed runs', async () => {
    // Create document logs (which become completed runs)
    const { documentLog: log1 } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
    })

    const { documentLog: log2 } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()

    expect(value.length).toBeGreaterThanOrEqual(2)
    const uuids = value.map((r) => r.uuid)
    expect(uuids).toContain(log1.uuid)
    expect(uuids).toContain(log2.uuid)
  })

  it('includes all required fields for completed runs', async () => {
    const { documentLog } = await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
    })

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    const run = value.find((r) => r.uuid === documentLog.uuid)
    expect(run).toBeDefined()
    if (!run) return

    // Verify all required fields are present
    expect(run.uuid).toBe(documentLog.uuid)
    expect(run.queuedAt).toBeInstanceOf(Date)
    expect(run.startedAt).toBeInstanceOf(Date)
    expect(run.endedAt).toBeInstanceOf(Date)
    expect(typeof run.caption).toBe('string')
    expect(run.log).toBeDefined()
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
    expect(value.every((r) => r.source === LogSources.Playground)).toBe(true)
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
      value.every(
        (r) =>
          r.source === LogSources.API || r.source === LogSources.Experiment,
      ),
    ).toBe(true)
  })

  it('paginates results correctly', async () => {
    // Create multiple document logs
    const count = 15
    for (let i = 0; i < count; i++) {
      await factories.createDocumentLog({
        document: setup.documents[0]!,
        commit: setup.commit,
        source: LogSources.API,
      })
    }

    // Get first page
    const page1 = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
      page: 1,
      pageSize: 5,
    })

    expect(page1.ok).toBe(true)
    if (!page1.ok) return
    const value1 = page1.unwrap()
    expect(value1.length).toBeLessThanOrEqual(5)

    // Get second page
    const page2 = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
      page: 2,
      pageSize: 5,
    })

    expect(page2.ok).toBe(true)
    if (!page2.ok) return
    const value2 = page2.unwrap()
    expect(value2.length).toBeLessThanOrEqual(5)
  })

  it('uses default pagination when not specified', async () => {
    // Create more than default page size runs
    const defaultPageSize = DEFAULT_PAGINATION_SIZE ?? 25
    const count = defaultPageSize + 10 // Create more to ensure pagination is applied
    for (let i = 0; i < count; i++) {
      await factories.createDocumentLog({
        document: setup.documents[0]!,
        commit: setup.commit,
        source: LogSources.API,
      })
    }

    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    // Should return exactly the default page size (first page)
    expect(value.length).toBe(defaultPageSize)
  })

  it('handles empty page gracefully', async () => {
    const result = await listCompletedRuns({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
      page: 100,
      pageSize: 10,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.unwrap()
    expect(value).toEqual([])
  })
})
