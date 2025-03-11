import {
  DocumentLog,
  EvaluationResultDto,
  EvaluationResultV2,
} from '@latitude-data/constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { database } from '../../../client'
import { ErrorableEntity } from '../../../constants'
import { evaluationResultsV2 } from '../../../schema'
import * as factories from '../../../tests/factories'
import { getUsageOverview } from './getUsageOverview'
import { buildAllData, onlyOverviewWorkspaces } from './testHelper'

let targetDate: Date
let data: Awaited<ReturnType<typeof buildAllData>>
describe('getUsageOverview', () => {
  beforeAll(async () => {
    // CI uses UTC timezone
    vi.stubEnv('TZ', 'UTC')

    targetDate = new Date(Date.UTC(2025, 1, 2, 0, 0, 0, 0))
    data = await buildAllData(targetDate)
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('returns all workspaces ordered by usage of runs', async () => {
    const result = await getUsageOverview({
      page: 1,
      pageSize: 10,
      targetDate,
    })

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        emails: expect.any(String), // TODO: fix troll tests
        lastMonthRuns: '6',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        lastMonthRuns: '4',
        lastTwoMonthsRuns: '3',
        latestRunAt: '2025-01-25 00:00:00',
      },
    ])
  })

  it('filter logs with errors', async () => {
    const { documentLog } = data.workspaces.workspaceB.info.logs[0] as {
      documentLog: DocumentLog
    }
    await factories.createRunError({
      errorableType: ErrorableEntity.DocumentLog,
      errorableUuid: documentLog.uuid,
      code: RunErrorCodes.Unknown,
      message: 'Error message',
    })

    const result = await getUsageOverview({
      page: 1,
      pageSize: 10,
      targetDate,
    })

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        emails: expect.any(String),
        lastMonthRuns: '6',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        name: data.workspaces.workspaceB.expectedData.name,
        lastMonthRuns: '3',
        lastTwoMonthsRuns: '3',
        latestRunAt: '2025-01-23 00:00:00',
      },
    ])
  })

  it('filter evaluation results with errors', async () => {
    const evaluationResult1 = data.workspaces.workspaceB.info
      .evaluationResults[0] as EvaluationResultDto
    await factories.createRunError({
      errorableType: ErrorableEntity.EvaluationResult,
      errorableUuid: evaluationResult1.uuid,
      code: RunErrorCodes.Unknown,
      message: 'Error message',
    })
    const evaluationResult2 = data.workspaces.workspaceB.info
      .evaluationResults[1] as EvaluationResultDto
    await factories.createRunError({
      errorableType: ErrorableEntity.EvaluationResult,
      errorableUuid: evaluationResult2.uuid,
      code: RunErrorCodes.Unknown,
      message: 'Error message',
    })
    const evaluationResultV21 = data.workspaces.workspaceB.info
      .evaluationResultsV2[0] as EvaluationResultV2
    const evaluationResultV22 = data.workspaces.workspaceB.info
      .evaluationResultsV2[1] as EvaluationResultV2
    await database
      .update(evaluationResultsV2)
      .set({
        error: { message: 'Error message' },
      })
      .where(
        inArray(evaluationResultsV2.id, [
          evaluationResultV21.id,
          evaluationResultV22.id,
        ]),
      )

    const result = await getUsageOverview({
      page: 1,
      pageSize: 10,
      targetDate,
    })

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        emails: expect.any(String),
        lastMonthRuns: '6',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '2', // Removed one here
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-25 00:00:00',
      },
    ])
  })
})
