'use server'

import { CommitsRepository, CommitStatus } from '@latitude-data/core'
import commitPresenter from '$/presenters/commitPresenter'
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
    const commits = await new CommitsRepository(ctx.workspace.id)
      .getCommitsByProject({
        project: ctx.project,
        filterByStatus: input.status,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? ULTRA_LARGE_PAGE_SIZE,
      })
      .then((r) => r.unwrap())
      .then((r) => r.map(commitPresenter))

    return commits
  })
