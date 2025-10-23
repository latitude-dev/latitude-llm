import { GET } from './route'
import { NextRequest } from 'next/server'

// Mock the dependencies
jest.mock('@latitude-data/core/repositories', () => ({
  ProjectsRepository: jest.fn().mockImplementation(() => ({
    find: jest.fn().mockResolvedValue({
      unwrap: () => ({ id: 1, workspaceId: 1, name: 'Test Project' })
    })
  })),
  IssuesRepository: jest.fn().mockImplementation(() => ({
    filterIssues: jest.fn().mockResolvedValue({
      value: {
        issues: [
          {
            id: 1,
            title: 'Test Issue',
            description: 'Test Description',
            documentUuid: 'test-uuid',
            last7DaysCount: 5,
            isNew: true,
            isResolved: false,
            isIgnored: false
          }
        ],
        hasMore: false,
        nextCursor: null
      }
    })
  })),
  CommitsRepository: jest.fn().mockImplementation(() => ({
    getCommitByUuid: jest.fn().mockResolvedValue({
      unwrap: () => ({ id: 1, uuid: 'live' })
    })
  }))
}))

jest.mock('@latitude-data/core/lib/dateFiltersParsing', () => ({
  parseAppearanceRangeFromQuery: jest.fn().mockReturnValue(null)
}))

jest.mock('$/middlewares/authHandler', () => ({
  authHandler: (handler: any) => handler
}))

jest.mock('$/middlewares/errorHandler', () => ({
  errorHandler: (handler: any) => handler
}))

describe('/api/projects/[projectId]/issues', () => {
  it('should return issues for a project', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects/123/issues')
    
    const response = await GET(request, {
      params: { projectId: '123' },
      workspace: { id: 1 } as any
    })

    expect(response.status).toBe(200)
    
    const data = await response.json()
    expect(data.issues).toHaveLength(1)
    expect(data.issues[0].title).toBe('Test Issue')
    expect(data.hasMore).toBe(false)
    expect(data.nextCursor).toBe(null)
  })

  it('should handle query parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects/123/issues?documentUuid=test-uuid&statuses=new,escalating&sort=relevance')
    
    const response = await GET(request, {
      params: { projectId: '123' },
      workspace: { id: 1 } as any
    })

    expect(response.status).toBe(200)
  })

  it('should handle pagination', async () => {
    const request = new NextRequest('http://localhost:3000/api/projects/123/issues?cursor=123&limit=10')
    
    const response = await GET(request, {
      params: { projectId: '123' },
      workspace: { id: 1 } as any
    })

    expect(response.status).toBe(200)
  })
})
