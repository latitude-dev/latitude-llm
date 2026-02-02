import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportSpansJob, ExportSpansJobData } from './exportSpansJob'
import * as factories from '../../../tests/factories'
import * as diskModule from '../../../lib/disk'
import { Result } from '../../../lib/Result'
import { publisher } from '../../../events/publisher'
import { findOrCreateExport } from '../../../services/exports/findOrCreate'

describe('exportSpansJob', () => {
  const exportUuid = crypto.randomUUID()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes createdAt filters before querying spans', async () => {
    const { workspace, user, documents, project, commit } =
      await factories.createProject({
        documents: {
          test: 'prompt content',
        },
      })

    const document = documents[0]
    const startedAt = new Date('2024-01-15T00:00:00.000Z')

    await factories.createSpan({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      startedAt,
    })

    const fileKey = `exports/${exportUuid}.csv`
    await findOrCreateExport({
      uuid: exportUuid,
      workspace,
      userId: user.id,
      fileKey,
    }).then((r) => r.unwrap())

    const mockDisk = {
      put: vi.fn().mockResolvedValue(Result.nil()),
      get: vi.fn(),
    }

    vi.spyOn(diskModule, 'diskFactory').mockReturnValue(mockDisk as any)
    vi.spyOn(publisher, 'publishLater').mockResolvedValue(undefined)

    const mockJob = {
      data: {
        exportUuid,
        workspaceId: workspace.id,
        userId: user.id,
        documentUuid: document.documentUuid,
        selectionMode: 'ALL',
        excludedSpanIdentifiers: [],
        filters: {
          createdAt: {
            from: '2024-01-01T00:00:00.000Z',
            to: new Date('2024-02-01T00:00:00.000Z').getTime(),
          },
        },
      },
    } as unknown as Job<ExportSpansJobData>

    await exportSpansJob(mockJob)

    expect(mockDisk.put).toHaveBeenCalledWith(fileKey, expect.any(String))
  })
})
