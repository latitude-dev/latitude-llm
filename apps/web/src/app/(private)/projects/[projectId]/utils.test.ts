import { Commit, HEAD_COMMIT } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { describe, expect, it } from 'vitest'

import { getCommitUrl } from './utils'

describe('getCommitUrl', () => {
  const mockProjectRoute = {
    commits: {
      latest: '/latest',
      detail: ({ uuid }: { uuid: string }) => ({ root: `/commits/${uuid}` }),
    },
  }

  const mockCommits: Commit[] = [
    { uuid: '1', mergedAt: new Date() },
    { uuid: '2', mergedAt: null },
    { uuid: '3', mergedAt: null },
  ]

  it('returns latest commit URL when lastSeenCommitUuid is HEAD_COMMIT', () => {
    const result = getCommitUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: HEAD_COMMIT,
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/latest')
  })

  it('returns latest commit URL when lastSeenCommitUuid is not found and there is a head commit', () => {
    const result = getCommitUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: 'non-existent',
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/latest')
  })

  it('returns specific commit URL when lastSeenCommitUuid is found', () => {
    const result = getCommitUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/2')
  })

  it('returns latest commit URL when there is a head commit and no lastSeenCommitUuid', () => {
    const result = getCommitUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/latest')
  })

  it('returns first commit URL when there is no head commit and no lastSeenCommitUuid', () => {
    const noHeadCommits = [{ uuid: '1', mergedAt: null }]
    const result = getCommitUrl({
      commits: noHeadCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/1')
  })

  it('throws NotFoundError when there are no commits', () => {
    expect(() =>
      getCommitUrl({
        commits: [],
        projectId: 1,
        lastSeenCommitUuid: undefined,
        PROJECT_ROUTE: () => mockProjectRoute,
      }),
    ).toThrow(NotFoundError)
  })
})
