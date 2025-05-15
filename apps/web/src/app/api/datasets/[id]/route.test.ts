import { Workspace } from '@latitude-data/core/browser'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspace, createDataset } from '@latitude-data/core/factories'
import { destroyDataset } from '@latitude-data/core/services/datasets/destroy'

import { GET } from './route'

const mocks = vi.hoisted(() => {
  return {
    getSession: vi.fn(),
  }
})
vi.mock('$/services/auth/getSession', () => ({
  getSession: mocks.getSession,
}))

describe('GET handler for datasets/[id]', () => {
  let mockRequest: NextRequest
  let mockParams: { id: string }
  let mockWorkspace: Workspace
  let mockUser: any

  beforeEach(async () => {
    mockRequest = new NextRequest('http://localhost:3000')
    const { workspace, userData } = await createWorkspace({
      name: 'test-workspace',
    })
    mockUser = userData
    mockWorkspace = workspace
  })

  describe('unauthorized', () => {
    it('should return 401 if user is not authenticated', async () => {
      const { dataset } = await createDataset({
        workspace: mockWorkspace,
        author: mockUser,
      })

      mockParams = { id: dataset.id.toString() }

      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
      } as any)

      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        message: 'Unauthorized',
      })
    })
  })

  describe('authorized', () => {
    beforeEach(async () => {
      mocks.getSession.mockReturnValue({ user: mockUser })
    })

    it('should return the dataset when a valid id is provided', async () => {
      const { dataset } = await createDataset({
        workspace: mockWorkspace,
        author: mockUser,
      })

      mockParams = { id: dataset.id.toString() }

      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
      })

      expect(response.status).toBe(200)
      const responseData = await response.json()
      expect(responseData).toMatchObject({
        id: dataset.id,
        name: dataset.name,
      })
    })

    it('should return a deleted dataset when a valid id is provided', async () => {
      // Create a dataset
      const { dataset } = await createDataset({
        workspace: mockWorkspace,
        author: mockUser,
      })

      // Mark the dataset as deleted using the service
      await destroyDataset({ dataset })

      mockParams = { id: dataset.id.toString() }

      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
      })

      expect(response.status).toBe(200)
      const responseData = await response.json()
      expect(responseData).toMatchObject({
        id: dataset.id,
        name: dataset.name,
        deletedAt: expect.any(String), // The deletedAt field should be present and be a string
      })
    })

    it('should return an error when dataset is not found', async () => {
      mockParams = { id: '999999' } // Non-existent ID

      const response = await GET(mockRequest, {
        params: mockParams,
        workspace: mockWorkspace,
      })

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining('999999'),
      })
    })
  })
})
