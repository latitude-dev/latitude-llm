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
      span: { id: 'span-id-789', documentLogUuid: 'doc-log-uuid-abc' },
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=span-id-789&documentLogUuid=doc-log-uuid-abc&expandedDocumentLogUuid=doc-log-uuid-abc',
    )
  })

  it('builds URL without documentLogUuid when span has none', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: { id: 'span-id-789', documentLogUuid: null },
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=span-id-789',
    )
  })

  it('uses expandedDocumentLogUuid when provided (sub-agent case)', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: { id: 'subagent-span-id', documentLogUuid: 'subagent-doc-log' },
      expandedDocumentLogUuid: 'parent-doc-log',
    })

    expect(url).toBe(
      '/projects/123/versions/commit-uuid-123/documents/doc-uuid-456/traces?' +
        'spanId=subagent-span-id&documentLogUuid=subagent-doc-log&expandedDocumentLogUuid=parent-doc-log',
    )
  })

  it('falls back to span.documentLogUuid for expandedDocumentLogUuid when not provided', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: { id: 'span-id', documentLogUuid: 'same-doc-log' },
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('documentLogUuid')).toBe('same-doc-log')
    expect(params.get('expandedDocumentLogUuid')).toBe('same-doc-log')
  })

  it('handles undefined documentLogUuid on span', () => {
    const url = buildTraceUrl({
      ...baseParams,
      span: { id: 'span-id', documentLogUuid: undefined as unknown as null },
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('spanId')).toBe('span-id')
    expect(params.has('documentLogUuid')).toBe(false)
    expect(params.has('expandedDocumentLogUuid')).toBe(false)
  })
})

describe('TRACE_SPAN_SELECTION_PARAM_KEYS', () => {
  it('contains all expected keys', () => {
    expect(TRACE_SPAN_SELECTION_PARAM_KEYS).toEqual({
      documentLogUuid: 'documentLogUuid',
      spanId: 'spanId',
      activeRunUuid: 'activeRunUuid',
      expandedDocumentLogUuid: 'expandedDocumentLogUuid',
    })
  })
})

describe('TRACE_SPAN_SELECTION_PARAMS', () => {
  it('contains all param values', () => {
    expect(TRACE_SPAN_SELECTION_PARAMS).toEqual([
      'documentLogUuid',
      'spanId',
      'activeRunUuid',
      'expandedDocumentLogUuid',
    ])
  })
})
