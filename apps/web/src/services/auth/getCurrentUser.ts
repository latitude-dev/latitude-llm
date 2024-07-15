import { cache } from 'react'

import { Result } from '@latitude-data/core'
import { getCurrentUserFromDB } from '$/data-access'

import { getSession } from './getSession'

export const getCurrentUser = cache(async () => {
  const sessionData = await getSession()
  const result = await getCurrentUserFromDB({ userId: sessionData?.user?.id })
  if (result.error) return result

  return Result.ok({
    session: sessionData.session!,
    user: result.value.user,
    workspace: result.value.workspace,
  })
})
