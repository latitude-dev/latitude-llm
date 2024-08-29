'use server'

import { CommitStatus } from '@latitude-data/core/browser'
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
    return new CommitsRepository(ctx.workspace.id)
      .getCommitsByProject({
        project: ctx.project,
        filterByStatus: input.status,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? ULTRA_LARGE_PAGE_SIZE,
      })
      .then((r) => r.unwrap())
  })
