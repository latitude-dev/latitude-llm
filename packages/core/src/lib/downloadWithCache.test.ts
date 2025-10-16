import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()

global.fetch = mockFetch as any

describe('downloadWithCache', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('should download and return data with correct structure', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')
    const testData = 'Hello World'
    const arrayBuffer = new TextEncoder().encode(testData).buffer

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBuffer),
      headers: {
        get: (key: string) => (key === 'content-type' ? 'text/plain' : null),
      },
    })

    const testUrl = new URL('https://example.com/test.txt')
    const result = await downloadWithCache(testUrl)

    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('mediaType')
    expect(result.data).toBeInstanceOf(Uint8Array)
    expect(result.mediaType).toBe('text/plain')

    const text = new TextDecoder().decode(result.data)
    expect(text).toBe(testData)

    expect(mockFetch).toHaveBeenCalledWith(testUrl)
  })

  it('should throw error on HTTP error responses', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    const errorUrl = new URL('https://example.com/notfound')

    await expect(downloadWithCache(errorUrl)).rejects.toThrow(
      'HTTP error! status: 404',
    )
  })

  it('should handle different content types', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')
    const jsonData = { key: 'value' }
    const arrayBuffer = new TextEncoder().encode(
      JSON.stringify(jsonData),
    ).buffer

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBuffer),
      headers: {
        get: (key: string) =>
          key === 'content-type' ? 'application/json' : null,
      },
    })

    const jsonUrl = new URL('https://example.com/data.json')
    const result = await downloadWithCache(jsonUrl)

    expect(result.mediaType).toBe('application/json')

    const text = new TextDecoder().decode(result.data)
    const parsed = JSON.parse(text)
    expect(parsed).toEqual(jsonData)
  })

  it('should handle missing content-type header', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')
    const testData = 'Data without content type'
    const arrayBuffer = new TextEncoder().encode(testData).buffer

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBuffer),
      headers: {
        get: () => null,
      },
    })

    const testUrl = new URL('https://example.com/noheader')
    const result = await downloadWithCache(testUrl)

    expect(result.mediaType).toBeUndefined()
    const text = new TextDecoder().decode(result.data)
    expect(text).toBe(testData)
  })

  it('should handle binary data correctly', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')
    const binaryData = new Uint8Array([1, 2, 3, 4, 5])
    const arrayBuffer = binaryData.buffer

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBuffer),
      headers: {
        get: (key: string) =>
          key === 'content-type' ? 'application/octet-stream' : null,
      },
    })

    const testUrl = new URL('https://example.com/binary.dat')
    const result = await downloadWithCache(testUrl)

    expect(result.mediaType).toBe('application/octet-stream')
    expect(result.data).toEqual(binaryData)
  })

  it('should handle large text data', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')
    const largeText = 'X'.repeat(10000)
    const arrayBuffer = new TextEncoder().encode(largeText).buffer

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(arrayBuffer),
      headers: {
        get: (key: string) => (key === 'content-type' ? 'text/plain' : null),
      },
    })

    const testUrl = new URL('https://example.com/large.txt')
    const result = await downloadWithCache(testUrl)

    const text = new TextDecoder().decode(result.data)
    expect(text.length).toBe(10000)
    expect(text).toBe(largeText)
  })

  it('should handle different HTTP status errors correctly', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')

    const testCases = [
      { status: 400, message: 'HTTP error! status: 400' },
      { status: 403, message: 'HTTP error! status: 403' },
      { status: 500, message: 'HTTP error! status: 500' },
    ]

    for (const testCase of testCases) {
      mockFetch.mockResolvedValue({
        ok: false,
        status: testCase.status,
      })

      const testUrl = new URL('https://example.com/error')

      await expect(downloadWithCache(testUrl)).rejects.toThrow(testCase.message)
    }
  })

  it('should handle network errors', async () => {
    const { downloadWithCache } = await import('./downloadWithCache')

    mockFetch.mockRejectedValue(new Error('Network error'))

    const testUrl = new URL('https://example.com/network-error')

    await expect(downloadWithCache(testUrl)).rejects.toThrow('Network error')
  })
})
