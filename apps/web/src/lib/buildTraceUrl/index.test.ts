import { describe, expect, it } from 'vitest'

import {
  buildTraceUrl,
  TRACE_SPAN_SELECTION_PARAM_KEYS,
  TRACE_SPAN_SELECTION_PARAMS,
} from './index'

describe('buildTraceUrl', () => {
  const baseParams = {
    projectId: 123,
    commitUuid: 'commit-uuid-123',
    documentUuid: 'doc-uuid-456',
  }

  it('builds URL with span id, traceId and documentLogUuid', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: {
        id: 'span-id-789',
        traceId: 'trace-id-abc',
        documentLogUuid: 'doc-log-uuid-abc',
      },
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=span-id-789&traceId=trace-id-abc&documentLogUuid=doc-log-uuid-abc',
    )
  })

  it('builds URL without documentLogUuid when span has none', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: {
        id: 'span-id-789',
        traceId: 'trace-id-abc',
        documentLogUuid: null,
      },
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=span-id-789&traceId=trace-id-abc',
    )
  })

  it('handles undefined documentLogUuid on span', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: {
        id: 'span-id',
        traceId: 'trace-id-abc',
        documentLogUuid: undefined as unknown as null,
      },
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('spanId')).toBe('span-id')
    expect(params.get('traceId')).toBe('trace-id-abc')
    expect(params.has('documentLogUuid')).toBe(false)
  })
})

describe('TRACE_SPAN_SELECTION_PARAM_KEYS', () => {
  it('contains all expected keys', () => {
    expect(TRACE_SPAN_SELECTION_PARAM_KEYS).toEqual({
      documentLogUuid: 'documentLogUuid',
      traceId: 'traceId',
      spanId: 'spanId',
    })
  })
})

describe('TRACE_SPAN_SELECTION_PARAMS', () => {
  it('contains all param values', () => {
    expect(TRACE_SPAN_SELECTION_PARAMS).toEqual([
      'documentLogUuid',
      'traceId',
      'spanId',
    ])
  })
})
