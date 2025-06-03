import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadLogsJob } from './downloadLogsJob'
import * as factories from '../../../tests/factories'
import { diskFactory } from '../../../lib/disk'
import { findOrCreateExport } from '../../../services/exports/findOrCreate'
import { markExportReady } from '../../../services/exports/markExportReady'
import { generateCsvFromLogs } from '../../../services/datasets/generateCsvFromLogs'
import { Result } from '../../../lib/Result'
import { Providers } from '@latitude-data/constants'

vi.mock('../../../lib/disk', () => ({
  diskFactory: vi.fn(),
}))
vi.mock('../../../services/exports/findOrCreate', () => ({
  findOrCreateExport: vi.fn(),
}))
vi.mock('../../../services/exports/markExportReady', () => ({
  markExportReady: vi.fn(),
}))
vi.mock('../../../services/datasets/generateCsvFromLogs', () => ({
  generateCsvFromLogs: vi.fn(),
}))

describe('downloadLogsJob', () => {
  let mockJob: Job
  let mockDisk: any
  let workspace: any
  let user: any
  let document: any
  let csvString: string
  let exportRecord: any

  beforeEach(async () => {
    vi.clearAllMocks()

    const projectData = await factories.createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        foo: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })
    workspace = projectData.workspace
    user = projectData.user
    document = projectData.documents[0]

    csvString = 'header1,header2\nvalue1,value2\nvalue3,value4'
    exportRecord = {
      uuid: 'test-token',
      workspaceId: workspace.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: user.id,
      token: 'test-token',
      fileKey: `workspaces/${workspace.id}/exports/test-token.csv`,
      readyAt: null,
    }

    mockDisk = {
      putStream: vi.fn().mockResolvedValue(Result.nil()),
      exists: vi.fn().mockResolvedValue(false),
      delete: vi.fn().mockResolvedValue(Result.nil()),
    }
    vi.mocked(diskFactory).mockReturnValue(mockDisk)

    vi.mocked(generateCsvFromLogs).mockResolvedValue(Result.ok(csvString))

    vi.mocked(findOrCreateExport).mockResolvedValue(Result.ok(exportRecord))
    vi.mocked(markExportReady).mockResolvedValue(Result.ok(exportRecord))

    mockJob = {
      data: {
        user,
        token: 'test-token',
        workspace,
        documentUuid: document.uuid,
        extendedFilterOptions: {},
        columnFilters: undefined,
      },
    } as any
  })

  it('should generate CSV, upload to disk, and mark export ready', async () => {
    const result = await downloadLogsJob(mockJob)

    expect(generateCsvFromLogs).toHaveBeenCalledWith({
      workspace,
      documentUuid: document.uuid,
      extendedFilterOptions: {},
      columnFilters: undefined,
    })
    expect(mockDisk.exists).toHaveBeenCalledWith(
      `workspaces/${workspace.id}/exports/test-token.csv`,
    )
    expect(mockDisk.putStream).toHaveBeenCalled()
    expect(findOrCreateExport).toHaveBeenCalledWith({
      uuid: 'test-token',
      workspace,
      userId: user.id,
      fileKey: `workspaces/${workspace.id}/exports/test-token.csv`,
    })
    expect(markExportReady).toHaveBeenCalledWith({ export: exportRecord })
    expect(result).toEqual({ totalProcessed: 2 })
  })

  it('should overwrite existing file if present', async () => {
    mockDisk.exists.mockResolvedValue(true)
    const result = await downloadLogsJob(mockJob)
    expect(mockDisk.delete).toHaveBeenCalledWith(
      `workspaces/${workspace.id}/exports/test-token.csv`,
    )
    expect(mockDisk.putStream).toHaveBeenCalled()
    expect(result).toEqual({ totalProcessed: 2 })
  })

  it('should throw if CSV generation fails', async () => {
    vi.mocked(generateCsvFromLogs).mockResolvedValue(
      Result.error(new Error('CSV error')),
    )
    await expect(downloadLogsJob(mockJob)).rejects.toThrow('CSV error')
  })

  it('should throw if disk write fails', async () => {
    mockDisk.putStream.mockResolvedValue(
      Result.error(new Error('Disk write failed')),
    )
    await expect(downloadLogsJob(mockJob)).rejects.toThrow('Disk write failed')
  })

  it('should throw if findOrCreateExport fails', async () => {
    vi.mocked(findOrCreateExport).mockResolvedValue(
      Result.error(new Error('Export error')),
    )
    await expect(downloadLogsJob(mockJob)).rejects.toThrow('Export error')
  })

  it('should throw if markExportReady fails', async () => {
    vi.mocked(markExportReady).mockResolvedValue(
      Result.error(new Error('Mark ready error')),
    )
    await expect(downloadLogsJob(mockJob)).rejects.toThrow('Mark ready error')
  })

  it('should handle empty CSV (only header)', async () => {
    vi.mocked(generateCsvFromLogs).mockResolvedValue(
      Result.ok('header1,header2\n'),
    )
    const result = await downloadLogsJob(mockJob)
    expect(result).toEqual({ totalProcessed: 0 })
  })
})
