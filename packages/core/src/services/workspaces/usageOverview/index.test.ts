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

    expect(onlyOverviewWorkspaces(result)).toEqual([
      {
        ...data.workspaces.workspaceA.expectedData,
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '4',
        currentPeriodAt: '2025-01-19 00:00:00',
        currentPeriodRuns: '4',
        oneMonthAgoPeriodAt: '2024-12-19 00:00:00',
        oneMonthAgoPeriodRuns: '1',
        twoMonthsAgoPeriodAt: '2024-11-19 00:00:00',
        twoMonthsAgoPeriodRuns: '2',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '3',
        currentPeriodAt: '2025-01-19 00:00:00',
        currentPeriodRuns: '2',
        oneMonthAgoPeriodAt: '2024-12-19 00:00:00',
        oneMonthAgoPeriodRuns: '2',
        twoMonthsAgoPeriodAt: '2024-11-19 00:00:00',
        twoMonthsAgoPeriodRuns: '1',
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
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '4',
        currentPeriodAt: '2025-01-19 00:00:00',
        currentPeriodRuns: '4',
        oneMonthAgoPeriodAt: '2024-12-19 00:00:00',
        oneMonthAgoPeriodRuns: '1',
        twoMonthsAgoPeriodAt: '2024-11-19 00:00:00',
        twoMonthsAgoPeriodRuns: '2',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '2',
        currentPeriodAt: '2025-01-19 00:00:00',
        currentPeriodRuns: '1',
        oneMonthAgoPeriodAt: '2024-12-19 00:00:00',
        oneMonthAgoPeriodRuns: '2',
        twoMonthsAgoPeriodAt: '2024-11-19 00:00:00',
        twoMonthsAgoPeriodRuns: '1',
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
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '4',
        currentPeriodAt: '2025-01-19 00:00:00',
        currentPeriodRuns: '4',
        oneMonthAgoPeriodAt: '2024-12-19 00:00:00',
        oneMonthAgoPeriodRuns: '1',
        twoMonthsAgoPeriodAt: '2024-11-19 00:00:00',
        twoMonthsAgoPeriodRuns: '2',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        subscriptionCreatedAt: '2024-07-19 00:00:00',
        lastMonthRuns: '2', // Removed one here
        currentPeriodAt: '2025-01-19 00:00:00',
        currentPeriodRuns: '1', // Removed one here
        oneMonthAgoPeriodAt: '2024-12-19 00:00:00',
        oneMonthAgoPeriodRuns: '2',
        twoMonthsAgoPeriodAt: '2024-11-19 00:00:00',
        twoMonthsAgoPeriodRuns: '0', // Removed one here
      },
    ])
  })
})
