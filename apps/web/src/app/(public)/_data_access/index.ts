import { cache } from 'react'

import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { unsafelyFindUserById } from '@latitude-data/core/queries/users/findById'
import { unsafelyFindMembershipByToken } from '@latitude-data/core/data-access/memberships'
import { Result } from '@latitude-data/core/lib/Result'
import { scanDocumentContent } from '@latitude-data/core/services/documents/scan'
import { findSharedDocument } from '@latitude-data/core/services/publishedDocuments/findSharedDocument'

export const findMembershipByTokenCache = cache(async (token: string) => {
  return await unsafelyFindMembershipByToken(token).then((r) => r.unwrap())
})

export const findWorkspaceCache = cache(async (id: number) => {
  return await unsafelyFindWorkspace(id)
})

export const findUserCache = cache(async (id: string) => {
  return await unsafelyFindUserById({ id })
})

export const findSharedDocumentCached = cache(
  async (publishedDocumentUuid: string) => {
    const result = await findSharedDocument({ publishedDocumentUuid })
    if (result.error) return result

    const { workspace, shared, document, commit } = result.value
    const metaResult = await scanDocumentContent({
      document,
      commit,
    })
    if (metaResult.error) return metaResult

    const { setConfig: _, ...metadata } = metaResult.value

    // TODO: Review all the data we pass to the client.
    // Maybe we don't need all of this.
    return Result.ok({ workspace, shared, document, commit, metadata })
  },
)
