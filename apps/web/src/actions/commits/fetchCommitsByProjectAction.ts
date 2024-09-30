'use server'

import { CommitStatus } from '@latitude-data/core/browser'
import { paginateQuery } from '@latitude-data/core/lib/index'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { withProject } from '../procedures'

// Not really using pagination yet
const ULTRA_LARGE_PAGE_SIZE = 1000
export const fetchCommitsByProjectAction = withProject
  .createServerAction()
  .input(
    z.object({
      status: z.nativeEnum(CommitStatus),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }),
    { type: 'json' },
  )
  .handler(async ({ input, ctx }) => {
    const repo = new CommitsRepository(ctx.workspace.id)
    const { rows } = await paginateQuery({
      dynamicQuery: repo
        .getCommitsByProjectQuery({
          project: ctx.project,
          filterByStatus: input.status,
        })
        .$dynamic(),
      defaultPaginate: {
        pageSize: ULTRA_LARGE_PAGE_SIZE,
      },
    })
    return rows
  })
