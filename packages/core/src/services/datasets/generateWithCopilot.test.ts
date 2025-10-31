import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest'
import * as env from '@latitude-data/env'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { UnprocessableEntityError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { type CreateWorkspaceResult } from '../../tests/factories/workspaces'
import { DatasetRowsRepository } from '../../repositories'
import * as copilotGet from '../copilot/get'
import * as copilotRun from '../copilot/run'
import { generateDatasetWithCopilot } from './generateWithCopilot'

let data: CreateWorkspaceResult
let mockGetCopilot: MockInstance
let mockRunCopilot: MockInstance
let envSpy: MockInstance

describe('generateDatasetWithCopilot', () => {
  beforeAll(async () => {
    data = await factories.createWorkspace()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()

    // Setup env spy with default values
    envSpy = vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    // Setup default mocks for copilot functions
    mockGetCopilot = vi.spyOn(copilotGet, 'getCopilot').mockResolvedValue(
      Result.ok({
        workspace: data.workspace,
        commit: {} as any,
        document: {} as any,
      }),
    )

    mockRunCopilot = vi.spyOn(copilotRun, 'runCopilot').mockResolvedValue(
      Result.ok({
        rows: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
        explanation: 'Generated sample dataset',
      }),
    )
  })

  it('creates a dataset from copilot generated rows', async () => {
    const result = await generateDatasetWithCopilot({
      workspace: data.workspace,
      user: data.userData,
      parameters: 'name,age',
      description: 'People dataset',
      prompt: 'Generate sample people',
      rowCount: 2,
      name: 'Copilot Dataset',
    })

    expect(Result.isOk(result)).toBe(true)
    const dataset = result.value!
    expect(dataset.name).toBe('Copilot Dataset')
    expect(dataset.author?.id).toBe(data.userData.id)
    // Columns should include expected names/roles (identifiers are generated)
    expect(
      dataset.columns.map((c) => ({ name: c.name, role: c.role })),
    ).toEqual([
      { name: 'name', role: 'parameter' },
      { name: 'age', role: 'parameter' },
    ])

    const repo = new DatasetRowsRepository(data.workspace.id)
    const rows = await repo.findByDatasetPaginated({
      datasetId: dataset.id,
      page: '1',
      pageSize: '100',
    })

    const nameCol = dataset.columns.find((c) => c.name === 'name')!
    const ageCol = dataset.columns.find((c) => c.name === 'age')!
    const plainRows = rows.map((r) => r.rowData)
    const values = plainRows.map((r) => ({
      name: r[nameCol.identifier],
      age: r[ageCol.identifier],
    }))
    expect(values).toEqual(
      expect.arrayContaining([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]),
    )
    expect(values).toHaveLength(2)
  })

  it('returns error when COPILOT_PROJECT_ID is not set', async () => {
    envSpy.mockReturnValue({
      ...env.env,
      COPILOT_PROJECT_ID: '',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    const res = await generateDatasetWithCopilot({
      workspace: data.workspace,
      user: data.userData,
      parameters: 'foo',
      rowCount: 1,
      name: 'x',
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(BadRequestError)
    expect(res.error?.message).toBe('COPILOT_PROJECT_ID is not set')
  })

  it('returns error when COPILOT_PROMPT_DATASET_GENERATOR_PATH is not set', async () => {
    envSpy.mockReturnValue({
      ...env.env,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    const res = await generateDatasetWithCopilot({
      workspace: data.workspace,
      user: data.userData,
      parameters: 'foo',
      rowCount: 1,
      name: 'x',
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(BadRequestError)
    expect(res.error?.message).toBe(
      'COPILOT_PROMPT_DATASET_GENERATOR_PATH is not set',
    )
  })

  it('returns error when COPILOT_WORKSPACE_API_KEY is not set', async () => {
    envSpy.mockReturnValue({
      ...env.env,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: '',
    } as any)

    const res = await generateDatasetWithCopilot({
      workspace: data.workspace,
      user: data.userData,
      parameters: 'foo',
      rowCount: 1,
      name: 'x',
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(BadRequestError)
    expect(res.error?.message).toBe('COPILOT_WORKSPACE_API_KEY is not set')
  })

  it('throws error when getCopilot fails', async () => {
    mockGetCopilot.mockResolvedValue(
      Result.error(new Error('Copilot not found')),
    )

    await expect(
      generateDatasetWithCopilot({
        workspace: data.workspace,
        user: data.userData,
        parameters: 'foo',
        rowCount: 1,
        name: 'x',
      }),
    ).rejects.toMatchObject({ ok: false })
  })

  it('throws error when runCopilot fails', async () => {
    mockRunCopilot.mockResolvedValue(
      Result.error(new UnprocessableEntityError('Copilot execution failed')),
    )

    await expect(
      generateDatasetWithCopilot({
        workspace: data.workspace,
        user: data.userData,
        parameters: 'foo',
        rowCount: 1,
        name: 'x',
      }),
    ).rejects.toMatchObject({ ok: false })
  })
})
