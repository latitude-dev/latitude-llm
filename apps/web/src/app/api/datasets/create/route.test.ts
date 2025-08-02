import { Workspace, User } from '@latitude-data/core/browser'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '@latitude-data/core/factories'

import { Result } from '@latitude-data/core/lib/Result'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})

vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('POST handler for datasets/create', () => {
  let mockWorkspace: Workspace
  let mockUser: User
  let mockFormData: FormData
  let validCsvFile: File

  beforeEach(async () => {
    const { workspace, userData } = await factories.createWorkspace({
      name: 'test-workspace',
    })
    mockUser = userData
    mockWorkspace = workspace

    const csvContent =
      'name,age,email\nJohn,25,john@example.com\nJane,30,jane@example.com'
    validCsvFile = new File([csvContent], 'test.csv', { type: 'text/csv' })

    mockFormData = new FormData()
    mockFormData.append('name', 'test-dataset')
    mockFormData.append('csvDelimiter', 'comma')
    mockFormData.append('csvCustomDelimiter', '')
    mockFormData.append('dataset_file', validCsvFile)

    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('unauthorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue(null)
    })

    it('should return 401 if user is not authenticated', async () => {
      const request = new NextRequest('http://localhost:3000', {
        method: 'POST',
        headers: {
          'content-length': '1000',
        },
        body: mockFormData,
      })

      const { POST } = await import('./route')
      const response = await POST(request, {
        workspace: mockWorkspace,
      })

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(() => {
      mocks.getSession.mockResolvedValue({
        user: mockUser,
        session: { userId: mockUser.id, currentWorkspaceId: mockWorkspace.id },
      })
    })

    describe('content-length validation', () => {
      it('should return 400 if content-length header is missing', async () => {
        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          body: mockFormData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data).toEqual({
          success: false,
          errors: { dataset_file: ['Content-Length header is required'] },
        })
      })

      it('should return 413 if file size exceeds maximum allowed', async () => {
        // Mock a large file size in content-length
        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            // 100MB + 1 byte (assuming MAX_UPLOAD_SIZE_IN_MB is 100MB)
            'content-length': '104857601',
          },
          body: mockFormData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(413)
        const data = await response.json()
        expect(data.success).toBe(false)
      })
    })

    describe('form validation', () => {
      it('should return 400 if name is missing', async () => {
        const formData = new FormData()
        formData.append('csvDelimiter', 'comma')
        formData.append('csvCustomDelimiter', '')
        formData.append('dataset_file', validCsvFile)

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: formData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.errors.name).toContain('Expected string, received null')
      })

      it('should return 400 if csvDelimiter is invalid', async () => {
        const formData = new FormData()
        formData.append('name', 'test-dataset')
        formData.append('csvDelimiter', 'invalid-delimiter')
        formData.append('csvCustomDelimiter', '')
        formData.append('dataset_file', validCsvFile)

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: formData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.errors.csvDelimiter).toContain(
          'Choose a valid delimiter option',
        )
      })

      it('should return 400 if custom delimiter is selected but not provided', async () => {
        const formData = new FormData()
        formData.append('name', 'test-dataset')
        formData.append('csvDelimiter', 'custom')
        formData.append('csvCustomDelimiter', '')
        formData.append('dataset_file', validCsvFile)

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: formData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.errors.csvCustomDelimiter).toContain(
          'Custom delimiter is required',
        )
      })

      it('should return 400 if file is not a CSV', async () => {
        const textFile = new File(['some text'], 'test.txt', {
          type: 'text/plain',
        })
        const formData = new FormData()
        formData.append('name', 'test-dataset')
        formData.append('csvDelimiter', 'comma')
        formData.append('csvCustomDelimiter', '')
        formData.append('dataset_file', textFile)

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: formData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.errors.dataset_file).toContain(
          'Your dataset must be a CSV file',
        )
      })

      it('should return 400 if dataset name already exists', async () => {
        await factories.createDataset({
          workspace: mockWorkspace,
          author: mockUser,
          name: 'test-dataset',
        })
        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: mockFormData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(400)
        const data = await response.json()
        expect(data.success).toBe(false)
        expect(data.errors.name).toContain(
          'This name was already used, please use something different',
        )
      })
    })

    describe('successful creation', () => {
      it('should create dataset with comma delimiter', async () => {
        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: mockFormData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.success).toBe(true)
        expect(data.dataset).toEqual(
          expect.objectContaining({
            id: expect.any(Number),
            name: 'test-dataset',
          }),
        )
      })

      it('should create dataset with custom delimiter', async () => {
        const formData = new FormData()
        formData.append('name', 'test-dataset')
        formData.append('csvDelimiter', 'custom')
        formData.append('csvCustomDelimiter', '|')
        formData.append('dataset_file', validCsvFile)

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: formData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.success).toBe(true)
      })

      it('should create dataset with semicolon delimiter', async () => {
        const formData = new FormData()
        formData.append('name', 'test-dataset')
        formData.append('csvDelimiter', 'semicolon')
        formData.append('csvCustomDelimiter', '')
        formData.append('dataset_file', validCsvFile)

        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: formData,
        })

        const { POST } = await import('./route')
        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })

        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.success).toBe(true)
      })
    })

    describe('error handling', () => {
      it('should handle createDatasetFromFile service errors', async () => {
        vi.doMock(
          '@latitude-data/core/services/datasets/createFromFile',
          () => ({
            createDatasetFromFile: vi
              .fn()
              .mockResolvedValue(Result.error(new Error('Service error'))),
          }),
        )
        const { POST } = await import('./route')
        const request = new NextRequest('http://localhost:3000', {
          method: 'POST',
          headers: {
            'content-length': '1000',
          },
          body: mockFormData,
        })

        const response = await POST(request, {
          workspace: mockWorkspace,
          user: mockUser,
        })
        expect(response.status).toBe(500)
      })
    })
  })
})
