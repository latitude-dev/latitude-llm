import { HEAD_COMMIT, mergeCommit } from '@latitude-data/core'
import useTestDatabase from '$core/tests/useTestDatabase'
import { NextRequest } from 'next/server'
import { describe, expect, test } from 'vitest'

import { GET } from './route'

useTestDatabase()

describe('GET documentVersion', () => {
  test('returns the document by path', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    await mergeCommit({ commitId: commit.id })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
      ),
      {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentPath: doc.path.split('/'),
        },
      },
    )

    expect(response.status).toBe(200)
    expect((await response.json()).id).toEqual(doc.id)
  })

  test('returns the document in main branch if commitUuid is HEAD', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    await mergeCommit({ commitId: commit.id })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/projects/projectId/commits/HEAD/path/to/doc',
      ),
      {
        params: {
          projectId: project.id,
          commitUuid: HEAD_COMMIT,
          documentPath: doc.path.split('/'),
        },
      },
    )

    expect(response.status).toBe(200)
    expect((await response.json()).id).toEqual(doc.id)
  })

  test('returns 404 if document is not found', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })

    await mergeCommit({ commitId: commit.id })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
      ),
      {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentPath: ['path', 'to', 'doc'],
        },
      },
    )

    expect(response.status).toBe(404)
  })

  test('returns the document even if commit is not merged', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    const response = await GET(
      new NextRequest(
        'http://localhost/api/projects/projectId/commits/commitUuid/path/to/doc',
      ),
      {
        params: {
          projectId: project.id,
          commitUuid: commit.uuid,
          documentPath: doc.path.split('/'),
        },
      },
    )

    expect(response.status).toBe(200)
    expect((await response.json()).id).toEqual(doc.id)
  })
})
