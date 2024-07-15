import { cache } from 'react'

import { getCurrentUserFromDB } from '$/data-access'
import db from '$/db/database'
import { Result } from '$core/lib'

import { getSession } from './getSession'

export const getCurrentUser = cache(async () => {
  const sessionData = await getSession()
  const result = await getCurrentUserFromDB(
    { userId: sessionData?.user?.id },
    { db },
  )
  if (result.error) return result

  return Result.ok({
    session: sessionData.session!,
    user: result.value.user,
    workspace: result.value.workspace,
  })
})
