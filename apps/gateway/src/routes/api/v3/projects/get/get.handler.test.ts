import { FastifyInstance } from 'fastify'
import { mock } from 'vitest-mock-extended'
import { ProjectsRepository, Result } from '@latitude-data/core' // Assuming this is the correct path
import { build } from '../../../../test/helpers' // Assuming this is the correct path for test helpers

// Mock the ProjectsRepository
vi.mock('@latitude-data/core', async () => {
  const originalModule = await vi.importActual('@latitude-data/core')
  return {
    ...originalModule,
    ProjectsRepository: vi.fn(),
  }
})


describe('GET /projects/:projectId', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = await build()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })


  it('should return 404 if project not found', async () => {
    const mockProject = { id: 1, name: 'Test Project' }
    const mockGetProjectById = vi.fn().mockResolvedValue(Result.error('Project not found'))
    // @ts-expect-error - mock
    ProjectsRepository.mockImplementation(() => ({
        getProjectById: mockGetProjectById
    }))

    const response = await app.inject({
      method: 'GET',
      url: '/projects/1',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ message: 'Project not found' })
    expect(mockGetProjectById).toHaveBeenCalledWith(1)
  })

  it('should return project if found', async () => {
    const mockProject = { id: 1, name: 'Test Project' }
    const mockGetProjectById = vi.fn().mockResolvedValue(Result.ok(mockProject))
     // @ts-expect-error - mock
    ProjectsRepository.mockImplementation(() => ({
        getProjectById: mockGetProjectById
    }))


    const response = await app.inject({
      method: 'GET',
      url: '/projects/1',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(mockProject)
    expect(mockGetProjectById).toHaveBeenCalledWith(1)
  })
})
