import { NextRequest, NextResponse } from 'next/server'
import { diskFactory } from '@latitude-data/core/lib/disk'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { BadRequestError, NotFoundError } from '@latitude-data/core/lib/errors'
import { findByUuid } from '@latitude-data/core/data-access/exports/findByUuid'
import { env } from '@latitude-data/env'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { uuid: string }
        workspace: Workspace
      },
    ) => {
      const { uuid } = params
      if (!uuid) throw new BadRequestError('Export UUID is required')

      const exportRecord = await findByUuid({ uuid, workspace })
      if (!exportRecord) throw new NotFoundError('Export not found')
      if (!exportRecord.readyAt) {
        throw new BadRequestError('Export is not ready yet')
      }

      const disk = diskFactory('private')

      if (env.DRIVE_DISK === 'local') {
        const fileStream = await disk.getStream(exportRecord.fileKey)
        // @ts-expect-error - types don't match
        return new Response(fileStream, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${uuid}.csv"`,
          },
        })
      }

      const signedUrl = await disk.getSignedUrl(exportRecord.fileKey, {
        expiresIn: 60 * 5, // 5 minutes
      })
      if (!signedUrl) throw new Error('Failed to generate download URL')

      return NextResponse.redirect(signedUrl)
    },
  ),
)
