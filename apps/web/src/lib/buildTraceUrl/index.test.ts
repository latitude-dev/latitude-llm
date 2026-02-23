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

  it('builds URL with span id and documentLogUuid', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: {
        id: 'span-id-789',
        documentLogUuid: 'doc-log-uuid-abc',
      },
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=span-id-789&documentLogUuid=doc-log-uuid-abc',
    )
  })

  it('builds URL without documentLogUuid when span has none', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: {
        id: 'span-id-789',
        documentLogUuid: undefined,
      },
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=span-id-789',
    )
  })
})

describe('TRACE_SPAN_SELECTION_PARAM_KEYS', () => {
  it('contains all expected keys', () => {
    expect(TRACE_SPAN_SELECTION_PARAM_KEYS).toEqual({
      documentLogUuid: 'documentLogUuid',
      spanId: 'spanId',
    })
  })
})

describe('TRACE_SPAN_SELECTION_PARAMS', () => {
  it('contains all param values', () => {
    expect(TRACE_SPAN_SELECTION_PARAMS).toEqual(['documentLogUuid', 'spanId'])
  })
})
