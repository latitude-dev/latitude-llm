'use client'

import { useEffect } from 'react'

import { lastSeenCommitCookieName } from '$/helpers/cookies/lastSeenCommit'
import Cookies from 'js-cookie'

export function LastSeenCommitCookie({
  projectId,
  commitUuid,
  documentUuid,
}: {
  projectId: number
  commitUuid: string
  documentUuid?: string
}) {
  const cookieName = lastSeenCommitCookieName(projectId)

  useEffect(() => {
    Cookies.set(cookieName, JSON.stringify({ commitUuid, documentUuid }), {
      sameSite: 'strict',
    })
  }, [cookieName, commitUuid, documentUuid])

  return null
}
