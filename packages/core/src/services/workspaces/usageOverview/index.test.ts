import {
  DocumentLog,
} from '@latitude-data/constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ErrorableEntity } from '../../../constants'
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
        lastMonthRuns: '4',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
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
        emails: expect.any(String),
        lastMonthRuns: '4',
        lastTwoMonthsRuns: '1',
        latestRunAt: '2025-01-26 00:00:00',
      },
      {
        ...data.workspaces.workspaceB.expectedData,
        emails: expect.any(String),
        name: data.workspaces.workspaceB.expectedData.name,
        lastMonthRuns: '2',
        lastTwoMonthsRuns: '2',
        latestRunAt: '2025-01-23 00:00:00',
      },
    ])
  })
})
