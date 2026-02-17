import { describe, expect, it } from 'vitest'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

import { ROUTES } from '../../../../services/routes'
import { getRedirectUrl } from './utils'

const PROJECT_ROUTE = ROUTES.projects.detail

describe('getRedirectUrl', () => {
  const mockCommits = [
    { uuid: '1', mergedAt: new Date() },
    { uuid: '2', mergedAt: null },
    { uuid: '3', mergedAt: null },
  ] as Commit[]

  const mockDocuments = [
    { documentUuid: 'doc-1' },
    { documentUuid: 'doc-2' },
  ] as DocumentVersion[]

  describe('when agentBuilder is enabled', () => {
    it('returns latest commit home URL when lastSeenCommitUuid is HEAD_COMMIT', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: HEAD_COMMIT,
        PROJECT_ROUTE,
        agentBuilder: true,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/live/home')
    })

    it('returns latest commit home URL when lastSeenCommitUuid is not found and there is a head commit', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: 'non-existent',
        PROJECT_ROUTE,
        agentBuilder: true,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/live/home')
    })

    it('returns specific commit home URL when lastSeenCommitUuid is found and not merged', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: '2',
        PROJECT_ROUTE,
        agentBuilder: true,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/2/home')
    })

    it('returns latest commit home URL when lastSeenCommitUuid is found but merged', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: '1',
        PROJECT_ROUTE,
        agentBuilder: true,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/live/home')
    })

    it('returns latest commit home URL when there is a head commit and no lastSeenCommitUuid', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: undefined,
        PROJECT_ROUTE,
        agentBuilder: true,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/live/home')
    })

    it('returns first commit home URL when there is no head commit and no lastSeenCommitUuid', () => {
      const noHeadCommits = [{ uuid: '1', mergedAt: null }] as Commit[]
      const result = getRedirectUrl({
        commits: noHeadCommits,
        projectId: 1,
        lastSeenCommitUuid: undefined,
        PROJECT_ROUTE,
        agentBuilder: true,
        documents: [],
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
        agentBuilder: true,
        documents: [],
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
        agentBuilder: true,
        documents: [],
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
        agentBuilder: true,
        documents: [],
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
        agentBuilder: true,
        documents: [],
      })
      expect(result).toBe(
        '/projects/1/versions/live/documents/fake-document-uuid',
      )
    })
  })

  describe('when agentBuilder is disabled', () => {
    it('returns first document URL when documents exist', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: HEAD_COMMIT,
        PROJECT_ROUTE,
        agentBuilder: false,
        documents: mockDocuments,
      })
      expect(result).toBe('/projects/1/versions/live/documents/doc-1')
    })

    it('returns issues URL when no documents exist', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: HEAD_COMMIT,
        PROJECT_ROUTE,
        agentBuilder: false,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/live/issues')
    })

    it('ignores lastSeenDocumentUuid and returns first document URL', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: '2',
        lastSeenDocumentUuid: 'some-other-document',
        PROJECT_ROUTE,
        agentBuilder: false,
        documents: mockDocuments,
      })
      expect(result).toBe('/projects/1/versions/2/documents/doc-1')
    })

    it('uses correct commit when lastSeenCommitUuid is not merged', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: '2',
        PROJECT_ROUTE,
        agentBuilder: false,
        documents: mockDocuments,
      })
      expect(result).toBe('/projects/1/versions/2/documents/doc-1')
    })

    it('uses head commit when lastSeenCommitUuid is merged', () => {
      const result = getRedirectUrl({
        commits: mockCommits,
        projectId: 1,
        lastSeenCommitUuid: '1',
        PROJECT_ROUTE,
        agentBuilder: false,
        documents: mockDocuments,
      })
      expect(result).toBe('/projects/1/versions/live/documents/doc-1')
    })

    it('returns issues URL on first commit when no head commit and no documents', () => {
      const noHeadCommits = [{ uuid: '1', mergedAt: null }] as Commit[]
      const result = getRedirectUrl({
        commits: noHeadCommits,
        projectId: 1,
        lastSeenCommitUuid: undefined,
        PROJECT_ROUTE,
        agentBuilder: false,
        documents: [],
      })
      expect(result).toBe('/projects/1/versions/1/issues')
    })
  })
})
