'use server'

import { destroyProject } from '@latitude-data/core/services/projects/destroy'

import { withProject } from '../procedures'

export const destroyProjectAction = withProject
  .createServerAction()
  .handler(async ({ ctx }) => {
    const result = await destroyProject({ project: ctx.project })
    return result.unwrap()
  })
