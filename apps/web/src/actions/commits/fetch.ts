'use server'

import { listCommits } from '@latitude-data/core'

import { withProject } from '../procedures'

export const getCommitsAction = withProject
  .createServerAction()
  .handler(() => listCommits())
