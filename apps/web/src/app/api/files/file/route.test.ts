import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { downloadWithCache } from '@latitude-data/core/lib/downloadWithCache'
import { GET } from './route'

// Mock the downloadWithCache function and env
vi.mock('@latitude-data/core/lib/downloadWithCache', () => ({
  downloadWithCache: vi.fn(),
}))

// Mock the env module to control FILE_CACHE behavior
vi.mock('@latitude-data/env', () => ({
  env: {
    FILE_CACHE: true,
  },
}))

describe('GET /api/files/file', () => {
  const mockDownloadWithCache = downloadWithCache as unknown as ReturnType<
    typeof vi.fn
  >

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 when URL parameter is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/files/file')
    const response = await GET(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toEqual({ error: 'URL parameter is required' })
  })

  it('should return 400 when URL format is invalid', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=invalid-url',
    )
    const response = await GET(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toEqual({ error: 'Invalid URL format' })
  })

  it('should return 400 when URL protocol is not allowed', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=ftp://example.com/file.txt',
    )
    const response = await GET(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toEqual({ error: 'Only HTTP and HTTPS protocols are allowed' })
  })

  it('should successfully download and return file content', async () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    const mockMediaType = 'text/plain'

    mockDownloadWithCache.mockResolvedValueOnce({
      data: mockData,
      mediaType: mockMediaType,
    })

    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=https://example.com/file.txt',
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(mockMediaType)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')

    const responseData = await response.arrayBuffer()
    expect(new Uint8Array(responseData)).toEqual(mockData)

    expect(mockDownloadWithCache).toHaveBeenCalledWith(
      new URL('https://example.com/file.txt'),
    )
  })

  it('should handle download errors gracefully', async () => {
    mockDownloadWithCache.mockRejectedValueOnce(new Error('Network error'))

    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=https://example.com/file.txt',
    )
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data).toEqual({ error: 'Failed to download file' })
  })

  it('should use default content type when media type is undefined', async () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5])

    mockDownloadWithCache.mockResolvedValueOnce({
      data: mockData,
      mediaType: undefined,
    })

    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=https://example.com/file.txt',
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'application/octet-stream',
    )
  })

  it('should handle special characters in URL', async () => {
    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    const testUrl =
      'https://example.com/file with spaces.txt?param=value&other=123'

    mockDownloadWithCache.mockResolvedValueOnce({
      data: mockData,
      mediaType: 'text/plain',
    })

    const request = new NextRequest(
      `http://localhost:3000/api/files/file?url=${encodeURIComponent(testUrl)}`,
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockDownloadWithCache).toHaveBeenCalledWith(new URL(testUrl))
  })

  it('should work when FILE_CACHE is disabled', async () => {
    // Mock env with FILE_CACHE disabled
    vi.doMock('@latitude-data/env', () => ({
      env: {
        FILE_CACHE: false,
      },
    }))

    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    const mockMediaType = 'text/plain'

    mockDownloadWithCache.mockResolvedValueOnce({
      data: mockData,
      mediaType: mockMediaType,
    })

    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=https://example.com/file.txt',
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(mockMediaType)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')

    const responseData = await response.arrayBuffer()
    expect(new Uint8Array(responseData)).toEqual(mockData)

    expect(mockDownloadWithCache).toHaveBeenCalledWith(
      new URL('https://example.com/file.txt'),
    )
  })

  it('should work when FILE_CACHE is enabled', async () => {
    // Mock env with FILE_CACHE enabled (default in our mock)
    const mockData = new Uint8Array([1, 2, 3, 4, 5])
    const mockMediaType = 'application/json'

    mockDownloadWithCache.mockResolvedValueOnce({
      data: mockData,
      mediaType: mockMediaType,
    })

    const request = new NextRequest(
      'http://localhost:3000/api/files/file?url=https://api.example.com/data.json',
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(mockMediaType)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')

    const responseData = await response.arrayBuffer()
    expect(new Uint8Array(responseData)).toEqual(mockData)

    expect(mockDownloadWithCache).toHaveBeenCalledWith(
      new URL('https://api.example.com/data.json'),
    )
  })
})
