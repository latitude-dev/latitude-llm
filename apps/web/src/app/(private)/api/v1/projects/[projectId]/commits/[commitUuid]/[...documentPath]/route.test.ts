import { HEAD_COMMIT, mergeCommit } from '@latitude-data/core'
import { LatitudeRequest } from '$/middleware'
import useTestDatabase from '$core/tests/useTestDatabase'
import { describe, expect, test } from 'vitest'

import { GET } from './route'

useTestDatabase()

describe('GET documentVersion', () => {
  test('returns the document by path', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    commit = await mergeCommit(commit).then((r) => r.unwrap())
    const req = new LatitudeRequest(
      'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
    )

    req.workspaceId = project.workspaceId

    const response = await GET(req, {
      params: {
        projectId: project.id,
        commitUuid: commit.uuid,
        documentPath: doc.path.split('/'),
      },
    })

    expect(response.status).toBe(200)
    const responseDoc = await response.json()
    expect(responseDoc.documentUuid).toEqual(doc.documentUuid)
    expect(responseDoc.commitId).toEqual(doc.commitId)
  })

  test('returns the document in main branch if commitUuid is HEAD', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    commit = await mergeCommit(commit).then((r) => r.unwrap())
    const req = new LatitudeRequest(
      'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
    )
    req.workspaceId = project.workspaceId

    const response = await GET(req, {
      params: {
        projectId: project.id,
        commitUuid: HEAD_COMMIT,
        documentPath: doc.path.split('/'),
      },
    })

    expect(response.status).toBe(200)
    const responseDoc = await response.json()
    expect(responseDoc.documentUuid).toEqual(doc.documentUuid)
    expect(responseDoc.commitId).toEqual(doc.commitId)
  })

  test('returns 404 if document is not found', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project })

    commit = await mergeCommit(commit).then((r) => r.unwrap())
    const req = new LatitudeRequest(
      'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
    )
    req.workspaceId = project.workspaceId

    const response = await GET(req, {
      params: {
        projectId: project.id,
        commitUuid: commit.uuid,
        documentPath: ['path', 'to', 'doc'],
      },
    })

    expect(response.status).toBe(404)
  })

  test('returns the document even if commit is not merged', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    const req = new LatitudeRequest(
      'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
    )
    req.workspaceId = project.workspaceId

    const response = await GET(req, {
      params: {
        projectId: project.id,
        commitUuid: commit.uuid,
        documentPath: doc.path.split('/'),
      },
    })

    expect(response.status).toBe(200)
    const responseDoc = await response.json()
    expect(responseDoc.documentUuid).toEqual(doc.documentUuid)
    expect(responseDoc.commitId).toEqual(doc.commitId)
  })
})
