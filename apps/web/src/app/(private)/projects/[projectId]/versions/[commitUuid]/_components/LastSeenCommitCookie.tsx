'use client'

import { useEffect } from 'react'

import { lastSeenCommitCookieName } from '$/helpers/cookies/lastSeenCommit'
import Cookies from 'js-cookie'

export function LastSeenCommitCookie({
  projectId,
  commitUuid,
}: {
  projectId: number
  commitUuid: string
}) {
  const cookieName = lastSeenCommitCookieName(projectId)

  useEffect(() => {
    Cookies.set(cookieName, commitUuid)
  }, [cookieName, commitUuid])

  return null
}
