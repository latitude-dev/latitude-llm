import { describe, expect, it } from 'vitest'

import { parseSSE } from './parseSSE'

describe('parseSSE', () => {
  it('should return undefined for undefined input', () => {
    expect(parseSSE(undefined)).toBeUndefined()
  })

  it('should return undefined for empty string input', () => {
    expect(parseSSE('')).toBeUndefined()
  })

  it('should parse a single field correctly', () => {
    const input = 'data: Hello, SSE!'
    expect(parseSSE(input)).toEqual({ data: 'Hello, SSE!' })
  })

  it('should parse multiple fields correctly', () => {
    const input = 'event: update\ndata: {"message": "Hello"}'
    expect(parseSSE(input)).toEqual({
      event: 'update',
      data: '{"message": "Hello"}',
    })
  })

  it('should handle empty lines between fields', () => {
    const input = 'event: update\n\ndata: {"message": "Hello"}'
    expect(parseSSE(input)).toEqual({
      event: 'update',
      data: '{"message": "Hello"}',
    })
  })

  it('should ignore comment lines', () => {
    const input = ':comment\nevent: update\ndata: {"message": "Hello"}'
    expect(parseSSE(input)).toEqual({
      event: 'update',
      data: '{"message": "Hello"}',
    })
  })

  it('should handle fields with no value', () => {
    const input = 'event:\ndata: {"message": "Hello"}'
    expect(parseSSE(input)).toEqual({
      event: '',
      data: '{"message": "Hello"}',
    })
  })

  it('should handle fields with no colon', () => {
    const input = 'event\ndata: {"message": "Hello"}'
    expect(parseSSE(input)).toEqual({
      event: '',
      data: '{"message": "Hello"}',
    })
  })

  it('should remove a single leading space from field values', () => {
    const input = 'data: Hello, SSE!'
    expect(parseSSE(input)).toEqual({ data: 'Hello, SSE!' })
  })

  it('should handle multiple lines for the same field', () => {
    const input = 'data: line 1\ndata: line 2\ndata: line 3'
    expect(parseSSE(input)).toEqual({ data: 'line 1\nline 2\nline 3' })
  })

  it('should handle different line endings', () => {
    const input = 'event: update\r\ndata: line 1\rdata: line 2\ndata: line 3'
    expect(parseSSE(input)).toEqual({
      event: 'update',
      data: 'line 1\nline 2\nline 3',
    })
  })

  it('should return undefined for input with only empty lines and comments', () => {
    const input = '\n\n:comment\n:another comment\n\n'
    expect(parseSSE(input)).toBeUndefined()
  })
})
