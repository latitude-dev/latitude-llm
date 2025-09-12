import { describe, expect, it } from 'vitest'
import { getAgentToolName, MAX_TOOL_NAME_LENGTH } from './helpers'

describe('getAgentToolName', () => {
  it('should never exceed the maximum tool name length', () => {
    const testCases = [
      '',
      'short',
      'a'.repeat(50),
      'a'.repeat(100),
      'a'.repeat(200),
      'very/long/path/with/many/segments/that/could/exceed/the/maximum/length/limit',
      'path/with/special/characters/!@#$%^&*()_+-=[]{}|;:,.<>?',
      'path/with/unicode/characters/café/naïve/résumé',
      '/' + 'a'.repeat(100),
      'a'.repeat(100) + '/',
      '/'.repeat(50),
      'deeply/nested/folder/structure/with/very/long/names/that/definitely/exceed/sixty/four/characters/in/total/length',
    ]

    testCases.forEach((agentPath) => {
      const result = getAgentToolName(agentPath)
      expect(result.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH)
    })
  })

  it('should always start with the agent tool prefix', () => {
    const testCases = ['', 'short', 'long'.repeat(20), 'path/with/slashes']

    testCases.forEach((agentPath) => {
      const result = getAgentToolName(agentPath)
      expect(result).toMatch(/^lat_agent_/)
    })
  })

  it('should replace forward slashes with underscores', () => {
    const testCases = [
      { input: 'path/to/agent', expected: 'lat_agent_path_to_agent' },
      {
        input: 'folder/subfolder/file',
        expected: 'lat_agent_folder_subfolder_file',
      },
      { input: '/leading/slash', expected: 'lat_agent__leading_slash' },
      { input: 'trailing/slash/', expected: 'lat_agent_trailing_slash_' },
      {
        input: '//double//slashes//',
        expected: 'lat_agent___double__slashes__',
      },
    ]

    testCases.forEach(({ input, expected }) => {
      const result = getAgentToolName(input)
      expect(result).toBe(expected)
    })
  })

  it('handles empty string', () => {
    const result = getAgentToolName('')
    expect(result).toBe('lat_agent_')
    expect(result.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH)
  })

  it('truncates long paths from the beginning', () => {
    // Create a path that would exceed the limit
    const longPath =
      'very/long/path/that/definitely/exceeds/the/maximum/allowed/length/for/tool/names'
    const result = getAgentToolName(longPath)

    // Should start with lat_agent_
    expect(result).toMatch(/^lat_agent_/)

    // Should not exceed max length
    expect(result.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH)

    // Should end with the last part of the original path (truncated from beginning)
    expect(result).toMatch(/_tool_names$/)
  })

  it('handles paths that are exactly at the limit', () => {
    // lat_agent_ is 10 characters, so we need 54 more characters to reach the limit
    const exactLengthSuffix = 'a'.repeat(54)
    const result = getAgentToolName(exactLengthSuffix)

    expect(result).toBe(`lat_agent_${exactLengthSuffix}`)
    expect(result.length).toBe(MAX_TOOL_NAME_LENGTH)
  })

  it('handles special characters in paths', () => {
    const specialChars = 'path-with.special@chars#test'
    const result = getAgentToolName(specialChars)

    expect(result).toBe('lat_agent_path-with.special@chars#test')
    expect(result.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH)
  })

  it('maintains consistency for the same input', () => {
    const testPath = 'consistent/test/path'
    const result1 = getAgentToolName(testPath)
    const result2 = getAgentToolName(testPath)

    expect(result1).toBe(result2)
    expect(result1.length).toBeLessThanOrEqual(MAX_TOOL_NAME_LENGTH)
  })
})
