import { Commit, HEAD_COMMIT } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { describe, expect, it } from 'vitest'

import { getRedirectUrl } from './utils'

describe('getCommitUrl', () => {
  const mockProjectRoute = {
    commits: {
      detail: ({ uuid }: { uuid: string }) => {
        return {
          overview: {
            root: `/commits/${uuid}/overview`,
          },
          documents: {
            root: `/commits/${uuid}/documents`,
            detail: ({ uuid: documentUuid }: { uuid: string }) => {
              return {
                root: `/commits/${uuid}/documents/${documentUuid}`,
              }
            },
          },
        }
      },
    },
  }

  const mockCommits: Commit[] = [
    // @ts-expect-error
    { uuid: '1', mergedAt: new Date() },
    // @ts-expect-error
    { uuid: '2', mergedAt: null },
    // @ts-expect-error
    { uuid: '3', mergedAt: null },
  ]

  it('returns latest commit URL when lastSeenCommitUuid is HEAD_COMMIT', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: HEAD_COMMIT,
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/live/overview')
  })

  it('returns latest commit URL when lastSeenCommitUuid is not found and there is a head commit', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: 'non-existent',
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/live/overview')
  })

  it('returns specific commit URL when lastSeenCommitUuid is found', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/2/overview')
  })

  it('returns latest commit URL when there is a head commit and no lastSeenCommitUuid', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/live/overview')
  })

  it('returns first commit URL when there is no head commit and no lastSeenCommitUuid', () => {
    const noHeadCommits = [{ uuid: '1', mergedAt: null }]
    const result = getRedirectUrl({
      // @ts-expect-error
      commits: noHeadCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/1/overview')
  })

  it('throws NotFoundError when there are no commits', () => {
    expect(() =>
      getRedirectUrl({
        commits: [],
        projectId: 1,
        lastSeenCommitUuid: undefined,
        PROJECT_ROUTE: () => mockProjectRoute,
      }),
    ).toThrow(NotFoundError)
  })

  it('redirects to document url if lastSeenDocumentUuid is provided', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      lastSeenDocumentUuid: 'fake-document-uuid',
      PROJECT_ROUTE: () => mockProjectRoute,
    })
    expect(result).toBe('/commits/2/documents/fake-document-uuid')
  })
})
