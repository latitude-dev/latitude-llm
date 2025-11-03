import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import * as env from '@latitude-data/env'
import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../lib/Result'
import { UnprocessableEntityError } from '../../lib/errors'
import { CLOUD_MESSAGES } from '../../constants'
import * as copilotGet from '../copilot/get'
import * as copilotRun from '../copilot/run'
import { generateDatasetWithCopilot } from './generateWithCopilot'

let mockGetCopilot: MockInstance
let mockRunCopilot: MockInstance
let envSpy: MockInstance

describe('generateDatasetWithCopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()

    // Setup env spy with default values
    envSpy = vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    // Setup default mocks for copilot functions
    mockGetCopilot = vi.spyOn(copilotGet, 'getCopilot').mockResolvedValue(
      Result.ok({
        workspace: {} as any,
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

  it('returns rows and explanation from copilot', async () => {
    const result = await generateDatasetWithCopilot({
      parameters: 'name,age',
      description: 'People dataset',
      prompt: 'Generate sample people',
      rowCount: 2,
    })

    expect(Result.isOk(result)).toBe(true)
    const data = result.value!
    expect(data.rows).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ])
    expect(data.explanation).toBe('Generated sample dataset')
    expect(data.rows).toHaveLength(2)
  })

  it('returns error when LATITUDE_CLOUD is not enabled', async () => {
    envSpy.mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: false,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    const res = await generateDatasetWithCopilot({
      parameters: 'foo',
      rowCount: 1,
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(BadRequestError)
    expect(res.error?.message).toBe(CLOUD_MESSAGES.generateDatasets)
  })

  it('returns error when COPILOT_PROJECT_ID is not set', async () => {
    envSpy.mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_PROJECT_ID: '',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    const res = await generateDatasetWithCopilot({
      parameters: 'foo',
      rowCount: 1,
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(BadRequestError)
    expect(res.error?.message).toBe('COPILOT_PROJECT_ID is not set')
  })

  it('returns error when COPILOT_PROMPT_DATASET_GENERATOR_PATH is not set', async () => {
    envSpy.mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '',
      COPILOT_WORKSPACE_API_KEY: 'workspace-api-key',
    } as any)

    const res = await generateDatasetWithCopilot({
      parameters: 'foo',
      rowCount: 1,
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
      LATITUDE_CLOUD: true,
      COPILOT_PROJECT_ID: 'project-id',
      COPILOT_PROMPT_DATASET_GENERATOR_PATH: '/copilot/datasets/generator',
      COPILOT_WORKSPACE_API_KEY: '',
    } as any)

    const res = await generateDatasetWithCopilot({
      parameters: 'foo',
      rowCount: 1,
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(BadRequestError)
    expect(res.error?.message).toBe('COPILOT_WORKSPACE_API_KEY is not set')
  })

  it('returns error when getCopilot fails', async () => {
    mockGetCopilot.mockResolvedValue(
      Result.error(new Error('Copilot not found')),
    )

    const res = await generateDatasetWithCopilot({
      parameters: 'foo',
      rowCount: 1,
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error?.message).toBe('Copilot not found')
  })

  it('returns error when runCopilot fails', async () => {
    mockRunCopilot.mockResolvedValue(
      Result.error(new UnprocessableEntityError('Copilot execution failed')),
    )

    const res = await generateDatasetWithCopilot({
      parameters: 'foo',
      rowCount: 1,
    })

    expect(Result.isOk(res)).toBe(false)
    expect(res.error).toBeInstanceOf(UnprocessableEntityError)
    expect(res.error?.message).toBe('Copilot execution failed')
  })
})
