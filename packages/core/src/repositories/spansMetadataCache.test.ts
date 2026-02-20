import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SPAN_METADATA_CACHE_TTL } from '../constants'

const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}

vi.mock('../cache', () => ({
  cache: vi.fn().mockResolvedValue(mockCache),
}))

vi.mock('../lib/disk', () => ({
  diskFactory: vi.fn().mockReturnValue({
    getBuffer: vi.fn(),
    putBuffer: vi.fn(),
  }),
}))

vi.mock('../lib/disk/compression', () => ({
  decompressToString: vi.fn().mockResolvedValue('{"type":"prompt"}'),
}))

describe('SpanMetadataRepository TTL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('uses default TTL when env var is not set', async () => {
    mockCache.get.mockResolvedValueOnce('{"type":"prompt"}')

    const { SpanMetadataRepository } = await import('./spansRepository')
    const repo = new SpanMetadataRepository(1)
    await repo.get({ spanId: 'span-1', traceId: 'trace-1' })

    expect(mockCache.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      SPAN_METADATA_CACHE_TTL,
    )
  })

  it('uses env var TTL when SPAN_METADATA_CACHE_TTL_SECONDS is set', async () => {
    vi.stubEnv('SPAN_METADATA_CACHE_TTL_SECONDS', '3600')
    mockCache.get.mockResolvedValueOnce('{"type":"prompt"}')

    vi.resetModules()

    vi.doMock('../cache', () => ({
      cache: vi.fn().mockResolvedValue(mockCache),
    }))
    vi.doMock('../lib/disk', () => ({
      diskFactory: vi.fn().mockReturnValue({
        getBuffer: vi.fn(),
        putBuffer: vi.fn(),
      }),
    }))
    vi.doMock('../lib/disk/compression', () => ({
      decompressToString: vi.fn().mockResolvedValue('{"type":"prompt"}'),
    }))

    const { SpanMetadataRepository } = await import('./spansRepository')
    const repo = new SpanMetadataRepository(1)
    await repo.get({ spanId: 'span-1', traceId: 'trace-1' })

    expect(mockCache.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      3600,
    )
  })
})
