import { describe, expect, it } from 'vitest'
import { ROUTES } from '$/services/routes'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import { getRedirectUrl } from './utils'

export const PROJECT_ROUTE = ROUTES.projects.detail
describe('getCommitUrl', () => {
  const mockCommits: Commit[] = [
    { uuid: '1', mergedAt: new Date() },
    { uuid: '2', mergedAt: null },
    { uuid: '3', mergedAt: null },
  ]

  it('returns latest commit URL when lastSeenCommitUuid is HEAD_COMMIT', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: HEAD_COMMIT,
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns latest commit URL when lastSeenCommitUuid is not found and there is a head commit', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: 'non-existent',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns specific commit URL when lastSeenCommitUuid is found', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/2/home')
  })

  it('returns latest commit URL when there is a head commit and no lastSeenCommitUuid', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns first commit URL when there is no head commit and no lastSeenCommitUuid', () => {
    const noHeadCommits = [{ uuid: '1', mergedAt: null }]
    const result = getRedirectUrl({
      commits: noHeadCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/1/home')
  })

  it('throws NotFoundError when there are no commits', () => {
    expect(() =>
      getRedirectUrl({
        commits: [],
        projectId: 1,
        lastSeenCommitUuid: undefined,
        PROJECT_ROUTE,
      }),
    ).toThrow(NotFoundError)
  })

  it('redirects to document url if lastSeenDocumentUuid is provided', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      lastSeenDocumentUuid: 'fake-document-uuid',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/2/documents/fake-document-uuid')
  })
})
