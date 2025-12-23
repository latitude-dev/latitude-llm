import { describe, expect, it, vi } from 'vitest'
import {
  ATTRIBUTES,
  VALUES,
  Otlp,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractSpanType,
} from './process'

vi.mock('../../../lib/disk', () => ({
  diskFactory: vi.fn(() => ({
    put: vi.fn().mockResolvedValue({ unwrap: () => undefined }),
  })),
}))

vi.mock('../../../cache', () => ({
  cache: vi.fn().mockResolvedValue({
    del: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('convertSpanAttributes', () => {
  it('converts OTLP attributes to key-value map', () => {
    const attributes: Otlp.Attribute[] = [
      { key: 'string_attr', value: { stringValue: 'hello' } },
      { key: 'int_attr', value: { intValue: 42 } },
      { key: 'bool_attr', value: { boolValue: true } },
    ]

    const result = convertSpanAttributes(attributes)

    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({
      string_attr: 'hello',
      int_attr: 42,
      bool_attr: true,
    })
  })

  it('handles all supported value types', () => {
    const attributes: Otlp.Attribute[] = [
      { key: 'string', value: { stringValue: 'test' } },
      { key: 'int', value: { intValue: 123 } },
      { key: 'bool', value: { boolValue: false } },
      {
        key: 'array',
        value: {
          arrayValue: {
            values: [{ stringValue: 'a' }, { stringValue: 'b' }],
          },
        },
      },
    ]

    const result = convertSpanAttributes(attributes)

    expect(result.value).toEqual({
      string: 'test',
      int: 123,
      bool: false,
      array: ['a', 'b'],
    })
  })

  it('drops invalid attributes without failing', () => {
    const attributes: Otlp.Attribute[] = [
      { key: 'valid', value: { stringValue: 'ok' } },
      { key: 'invalid', value: {} },
    ]

    const result = convertSpanAttributes(attributes)

    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({ valid: 'ok' })
  })

  it('handles empty attributes array', () => {
    const result = convertSpanAttributes([])

    expect(result.error).toBeUndefined()
    expect(result.value).toEqual({})
  })
})

describe('extractSpanType', () => {
  it('classifies LLM completion operations', () => {
    const attributes = {
      [ATTRIBUTES.LATITUDE.type]: SpanType.Completion,
    }

    const result = extractSpanType(attributes)

    expect(result.value).toBe(SpanType.Completion)
  })

  it('classifies tool/function operations', () => {
    const attributes = {
      [ATTRIBUTES.LATITUDE.type]: SpanType.Tool,
    }

    const result = extractSpanType(attributes)

    expect(result.value).toBe(SpanType.Tool)
  })

  it('classifies embedding operations', () => {
    const attributes = {
      [ATTRIBUTES.LATITUDE.type]: SpanType.Embedding,
    }

    const result = extractSpanType(attributes)

    expect(result.value).toBe(SpanType.Embedding)
  })

  it('classifies prompt operations', () => {
    const attributes = {
      [ATTRIBUTES.LATITUDE.type]: SpanType.Prompt,
    }

    const result = extractSpanType(attributes)

    expect(result.value).toBe(SpanType.Prompt)
  })

  it('falls back to Unknown for unrecognized operations', () => {
    const attributes = {}

    const result = extractSpanType(attributes)

    expect(result.value).toBe(SpanType.Unknown)
  })

  it('uses gen_ai.operation.name when latitude.type is missing', () => {
    const attributes = {
      [ATTRIBUTES.OPENTELEMETRY.GEN_AI.operation]:
        VALUES.OPENTELEMETRY.GEN_AI.operation.chat,
    }

    const result = extractSpanType(attributes)

    expect(result.value).toBe(SpanType.Completion)
  })
})

describe('convertSpanStatus', () => {
  it('normalizes OTLP Ok status', () => {
    const result = convertSpanStatus({ code: Otlp.StatusCode.Ok })

    expect(result.value).toBe(SpanStatus.Ok)
  })

  it('normalizes OTLP Error status', () => {
    const result = convertSpanStatus({ code: Otlp.StatusCode.Error })

    expect(result.value).toBe(SpanStatus.Error)
  })

  it('normalizes OTLP Unset status', () => {
    const result = convertSpanStatus({ code: Otlp.StatusCode.Unset })

    expect(result.value).toBe(SpanStatus.Unset)
  })

  it('treats unknown codes as Unset', () => {
    const result = convertSpanStatus({ code: 999 })

    expect(result.value).toBe(SpanStatus.Unset)
  })
})
