import { cache } from 'react'

import {
  unsafelyFindMembershipByToken,
  unsafelyFindWorkspace,
  unsafelyGetUser,
} from '@latitude-data/core'
import { Result } from '@latitude-data/core'
import { scanDocumentContent } from '@latitude-data/core'
import { findSharedDocument } from '@latitude-data/core'

export const findMembershipByTokenCache = cache(async (token: string) => {
  return await unsafelyFindMembershipByToken(token).then((r) => r.unwrap())
})

export const findWorkspaceCache = cache(async (id: number) => {
  return await unsafelyFindWorkspace(id)
})

export const findUserCache = cache(async (id: string) => {
  return await unsafelyGetUser(id)
})

export const findSharedDocumentCached = cache(
  async (publishedDocumentUuid: string) => {
    const result = await findSharedDocument({ publishedDocumentUuid })
    if (result.error) return result

    const { workspace, shared, document, commit } = result.value
    const metaResult = await scanDocumentContent({
      workspaceId: shared.workspaceId,
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
