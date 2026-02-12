import { cache as redis } from '../cache'
import {
  SPAN_METADATA_CACHE_TTL,
  SPAN_METADATA_STORAGE_KEY,
  SpanMetadata,
  SpanType,
} from '../constants'
import { diskFactory, DiskWrapper } from '../lib/disk'
import { Result } from '../lib/Result'

export class SpanMetadatasRepository {
  protected workspaceId: number
  protected disk: DiskWrapper

  constructor(workspaceId: number, disk: DiskWrapper = diskFactory('private')) {
    this.workspaceId = workspaceId
    this.disk = disk
  }

  static buildKey(span: { traceId: string; id: string }) {
    return `${span.traceId}:${span.id}`
  }

  async get<T extends SpanType = SpanType>({
    spanId,
    traceId,
    fresh,
  }: {
    spanId: string
    traceId: string
    fresh?: boolean
  }) {
    const key = SPAN_METADATA_STORAGE_KEY(this.workspaceId, traceId, spanId)
    const cache = await redis()

    try {
      let payload = fresh ? undefined : await cache.get(key)
      if (!payload) payload = await this.disk.get(key)

      const metadata = JSON.parse(payload)

      await cache.set(key, payload, 'EX', SPAN_METADATA_CACHE_TTL)

      return Result.ok<SpanMetadata<T>>(metadata)
    } catch {
      return Result.nil()
    }
  }

  async invalidate({ spanId, traceId }: { spanId: string; traceId: string }) {
    const key = SPAN_METADATA_STORAGE_KEY(this.workspaceId, traceId, spanId)
    const cache = await redis()

    try {
      await cache.del(key)
      return Result.nil()
    } catch {
      return Result.nil()
    }
  }

  /**
   * Batch fetch metadata for multiple spans in parallel.
   * Returns a Map keyed by span key (traceId:spanId).
   */
  async getBatch<T extends SpanType = SpanType>(
    spanIdentifiers: Array<{ traceId: string; spanId: string }>,
  ) {
    if (spanIdentifiers.length === 0) {
      return new Map<string, SpanMetadata<T>>()
    }

    const results = await Promise.all(
      spanIdentifiers.map(async ({ traceId, spanId }) => {
        const result = await this.get<T>({ traceId, spanId })
        return {
          key: SpanMetadatasRepository.buildKey({ traceId, id: spanId }),
          metadata: result.ok ? result.value : undefined,
        }
      }),
    )

    const metadataMap = new Map<string, SpanMetadata<T>>()
    for (const { key, metadata } of results) {
      if (metadata) {
        metadataMap.set(key, metadata)
      }
    }

    return metadataMap
  }
}
