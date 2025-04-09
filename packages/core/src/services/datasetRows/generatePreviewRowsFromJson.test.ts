import { describe, it, expect } from 'vitest'
import {
  extractHeadersFromFirstRow,
  generatePreviewRowsFromJson,
} from './generatePreviewRowsFromJson'
import { identityHashAlgorithm } from '../datasets/utils'

const validJsonArray = JSON.stringify([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
])

const emptyJsonArray = JSON.stringify([])
const invalidJson = '{ invalid json }'
const nonArrayJson = JSON.stringify({ name: 'Charlie' })
const brokenJson = '{ "name": "Alice", "age": 30 '

describe('extractHeadersFromFirstRow', () => {
  it('extracts headers and rows from valid JSON', () => {
    const result = extractHeadersFromFirstRow({
      json: validJsonArray,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.value).toEqual({
      columns: [
        {
          identifier: 'name_identifier',
          name: 'name',
          role: 'parameter',
        },
        {
          identifier: 'age_identifier',
          name: 'age',
          role: 'parameter',
        },
      ],
      rows: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    })
  })

  it('returns empty columns and rows for empty JSON array', () => {
    const result = extractHeadersFromFirstRow({
      json: emptyJsonArray,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.value).toEqual({
      columns: [],
      rows: [],
    })
  })

  it('returns error for invalid JSON', () => {
    const result = extractHeadersFromFirstRow({
      json: invalidJson,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.error).toBeTruthy()
    expect(result.error?.message).toBe('Invalid generated data')
  })

  it('returns error for broken JSON', () => {
    const result = extractHeadersFromFirstRow({
      json: brokenJson,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.error).toBeTruthy()
    expect(result.error?.message).toBe('Invalid generated data')
  })

  it('returns error for non-array JSON', () => {
    const result = extractHeadersFromFirstRow({
      json: nonArrayJson,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.error).toBeTruthy()
    expect(result.error?.message).toBe(
      'Invalid JSON format it has to be an array',
    )
  })
})

describe('generatePreviewRowsFromJson', () => {
  it('generates preview rows from valid JSON', () => {
    const result = generatePreviewRowsFromJson({
      rows: validJsonArray,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.value).toEqual({
      headers: [
        {
          identifier: 'name_identifier',
          name: 'name',
          role: 'parameter',
        },
        {
          identifier: 'age_identifier',
          name: 'age',
          role: 'parameter',
        },
      ],
      rows: [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    })
  })

  it('returns empty preview for empty JSON array', () => {
    const result = generatePreviewRowsFromJson({
      rows: emptyJsonArray,
      hashAlgorithm: identityHashAlgorithm,
    })
    expect(result.value).toEqual({
      headers: [],
      rows: [],
    })
  })
})
