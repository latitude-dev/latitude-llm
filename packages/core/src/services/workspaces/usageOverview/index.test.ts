import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { buildAllData, onlyOverviewWorkspaces } from './testHelper'
import { getUsageOverview } from './getUsageOverview'
import * as factories from '../../../tests/factories'
import { ErrorableEntity } from '../../../constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { DocumentLog, EvaluationResultDto } from '@latitude-data/constants'

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

    const overviewWorkspaces = onlyOverviewWorkspaces(result)
    expect(overviewWorkspaces).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        lastMonthRuns: '4',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        lastMonthRuns: '3',
        lastTwoMonthsRuns: '2',
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
        lastMonthRuns: '4',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        name: data.workspaces.workspaceB.expectedData.name,
        lastMonthRuns: '2',
        lastTwoMonthsRuns: '2',
        latestRunAt: '2025-01-23 00:00:00',
      },
    ])
  })

  it('filter evaluation results with errors', async () => {
    const evaluationResult = data.workspaces.workspaceB.info
      .evaluationResults[0] as EvaluationResultDto
    const evaluationResult1 = data.workspaces.workspaceB.info
      .evaluationResults[1] as EvaluationResultDto
    await factories.createRunError({
      errorableType: ErrorableEntity.EvaluationResult,
      errorableUuid: evaluationResult.uuid,
      code: RunErrorCodes.Unknown,
      message: 'Error message',
    })
    await factories.createRunError({
      errorableType: ErrorableEntity.EvaluationResult,
      errorableUuid: evaluationResult1.uuid,
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
        lastMonthRuns: '4',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '2', // Removed one here
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-25 00:00:00',
      },
    ])
  })
})
