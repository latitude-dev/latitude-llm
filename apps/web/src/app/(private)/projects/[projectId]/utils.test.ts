import { describe, expect, it } from 'vitest'
import { ROUTES } from '$/services/routes'

import { getRedirectUrl } from './utils'

import { HEAD_COMMIT } from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
export const PROJECT_ROUTE = ROUTES.projects.detail
describe('getRedirectUrl', () => {
  const mockCommits: Commit[] = [
    // @ts-expect-error
    { uuid: '1', mergedAt: new Date() },
    // @ts-expect-error
    { uuid: '2', mergedAt: null },
    // @ts-expect-error
    { uuid: '3', mergedAt: null },
  ]

  it('returns latest commit home URL when lastSeenCommitUuid is HEAD_COMMIT', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: HEAD_COMMIT,
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns latest commit home URL when lastSeenCommitUuid is not found and there is a head commit', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: 'non-existent',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns specific commit home URL when lastSeenCommitUuid is found and not merged', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/2/home')
  })

  it('returns latest commit home URL when lastSeenCommitUuid is found but merged', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '1',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns latest commit home URL when there is a head commit and no lastSeenCommitUuid', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/live/home')
  })

  it('returns first commit home URL when there is no head commit and no lastSeenCommitUuid', () => {
    const noHeadCommits = [{ uuid: '1', mergedAt: null }]
    const result = getRedirectUrl({
      // @ts-expect-error
      commits: noHeadCommits,
      projectId: 1,
      lastSeenCommitUuid: undefined,
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/1/home')
  })

  it('returns document detail URL when lastSeenDocumentUuid is provided', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '2',
      lastSeenDocumentUuid: 'fake-document-uuid',
      PROJECT_ROUTE,
    })
    expect(result).toBe('/projects/1/versions/2/documents/fake-document-uuid')
  })

  it('returns default commit document detail URL when lastSeenDocumentUuid is provided but lastSeenCommitUuid is HEAD_COMMIT', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: HEAD_COMMIT,
      lastSeenDocumentUuid: 'fake-document-uuid',
      PROJECT_ROUTE,
    })
    expect(result).toBe(
      '/projects/1/versions/live/documents/fake-document-uuid',
    )
  })

  it('returns default commit document detail URL when lastSeenDocumentUuid is provided but lastSeenCommitUuid is merged', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: '1',
      lastSeenDocumentUuid: 'fake-document-uuid',
      PROJECT_ROUTE,
    })
    expect(result).toBe(
      '/projects/1/versions/live/documents/fake-document-uuid',
    )
  })

  it('returns default commit document detail URL when lastSeenDocumentUuid is provided but lastSeenCommitUuid is not found', () => {
    const result = getRedirectUrl({
      commits: mockCommits,
      projectId: 1,
      lastSeenCommitUuid: 'non-existent',
      lastSeenDocumentUuid: 'fake-document-uuid',
      PROJECT_ROUTE,
    })
    expect(result).toBe(
      '/projects/1/versions/live/documents/fake-document-uuid',
    )
  })
})
