import { LOG_SOURCES, LogSources } from '../../../constants'
import { beforeAll, describe, expect, it } from 'vitest'
import * as factories from '../../../tests/factories'
import { type FactoryCreateProjectReturn } from '../../../tests/factories'
import { countCompletedRunsBySource } from './countCompletedBySource'

let setup: FactoryCreateProjectReturn

describe('countCompletedRunsBySource', () => {
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

  it('returns zero counts for all sources when no runs exist', async () => {
    const result = await countCompletedRunsBySource({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const countBySource = result.unwrap()

    // Verify all sources are present with 0 count
    for (const source of LOG_SOURCES) {
      expect(countBySource[source]).toBe(0)
    }
  })

  it('counts completed runs by source correctly', async () => {
    // Create document logs with different sources
    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
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

    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Experiment,
    })

    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.Playground,
    })

    const result = await countCompletedRunsBySource({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const countBySource = result.unwrap()
    expect(countBySource[LogSources.API]).toBeGreaterThanOrEqual(2)
    expect(countBySource[LogSources.Playground]).toBeGreaterThanOrEqual(2)
    expect(countBySource[LogSources.Experiment]).toBeGreaterThanOrEqual(1)
  })

  it('returns all sources in the result', async () => {
    const result = await countCompletedRunsBySource({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const countBySource = result.unwrap()
    // Verify all LOG_SOURCES are present
    for (const source of LOG_SOURCES) {
      expect(countBySource).toHaveProperty(source)
      expect(typeof countBySource[source]).toBe('number')
    }
  })

  it('updates counts correctly when runs are added', async () => {
    // Initial count
    const initial = await countCompletedRunsBySource({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })
    expect(initial.ok).toBe(true)
    if (!initial.ok) return
    const initialCountBySource = initial.unwrap()
    const initialApiCount = initialCountBySource[LogSources.API]

    // Add a run
    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
    })

    // Updated count
    const updated = await countCompletedRunsBySource({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    const updatedCountBySource = updated.unwrap()
    expect(updatedCountBySource[LogSources.API]).toBe(initialApiCount + 1)
  })

  it('handles different projects independently', async () => {
    // Create a second project
    const setup2 = await factories.createProject({
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

    // Create runs in first project
    await factories.createDocumentLog({
      document: setup.documents[0]!,
      commit: setup.commit,
      source: LogSources.API,
    })

    // Create runs in second project
    await factories.createDocumentLog({
      document: setup2.documents[0]!,
      commit: setup2.commit,
      source: LogSources.Playground,
    })

    // Count for first project
    const result1 = await countCompletedRunsBySource({
      workspaceId: setup.workspace.id,
      projectId: setup.project.id,
    })
    expect(result1.ok).toBe(true)
    if (!result1.ok) return

    // Count for second project
    const result2 = await countCompletedRunsBySource({
      workspaceId: setup2.workspace.id,
      projectId: setup2.project.id,
    })
    expect(result2.ok).toBe(true)
    if (!result2.ok) return
    const countBySource1 = result1.unwrap()
    const countBySource2 = result2.unwrap()

    // They should be independent
    expect(countBySource1[LogSources.API]).toBeGreaterThanOrEqual(1)
    expect(countBySource2[LogSources.Playground]).toBeGreaterThanOrEqual(1)
  })
})
