import { cache } from 'react'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { findOrCreateMainDocument } from '@latitude-data/core/services/dualScope/findOrCreateMainDocument'
import { Project } from '@latitude-data/core/schema/models/types/Project'

export const findOrCreateMainDocumentCached = cache(
  async ({ project }: { project: Project }) => {
    const { workspace, user } = await getCurrentUserOrRedirect()
    return findOrCreateMainDocument({
      workspace,
      project,
      user,
    }).then((r) => r.unwrap())
  },
)
