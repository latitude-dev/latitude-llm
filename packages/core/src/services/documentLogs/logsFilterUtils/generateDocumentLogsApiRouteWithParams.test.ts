import { describe, it, expect } from 'vitest'
import { formatISO } from 'date-fns'
import { generateDocumentLogsApiRouteWithParams } from './generateDocumentLogsApiRouteWithParams'
import { LogSources } from '../../../constants'

const mockPath = '/api/logs'

describe('generateDocumentLogsApiRouteWithParams', () => {
  it('should generate a URL with no params', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {},
    })
    expect(result).toBe(mockPath)
  })

  it('should handle page and pageSize', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: { page: 1, pageSize: 20 },
    })
    expect(result).toBe(`${mockPath}?page=1&pageSize=20`)
  })

  it('should handle excludeErrors and days', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: { excludeErrors: true, days: 7 },
    })
    expect(result).toBe(`${mockPath}?excludeErrors=true&days=7`)
  })

  it('should handle filterOptions with createdAt (only from date)', () => {
    const fromDate = new Date('2024-01-01')
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: { from: fromDate, to: undefined },
          commitIds: [],
          logSources: [],
        },
      },
    })
    expect(result).toBe(`${mockPath}?createdAt=${formatISO(fromDate)}`)
  })

  it('should handle filterOptions with createdAt (from and to date)', () => {
    const fromDate = new Date('2024-01-01')
    const toDate = new Date('2024-01-10')
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: { from: fromDate, to: toDate },
          commitIds: [],
          logSources: [],
        },
      },
    })
    expect(result).toBe(
      `${mockPath}?createdAt=${formatISO(fromDate)},${formatISO(toDate)}`,
    )
  })

  it('should handle filterOptions with empty commitIds and logSources', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: undefined,
          commitIds: [],
          logSources: [],
        },
      },
    })
    expect(result).toBe(`${mockPath}`)
  })

  it('should handle filterOptions with non-empty commitIds and logSources', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: undefined,
          commitIds: [123, 456],
          logSources: [LogSources.API, LogSources.User],
        },
      },
    })
    expect(result).toBe(`${mockPath}?commitIds=123,456&logSources=api,user`)
  })

  it('should handle mixed parameters', () => {
    const fromDate = new Date('2024-01-01')
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        page: 1,
        pageSize: 50,
        filterOptions: {
          createdAt: { from: fromDate, to: undefined },
          commitIds: [789],
          logSources: [LogSources.API],
        },
        excludeErrors: true,
        days: 30,
      },
    })
    expect(result).toBe(
      `${mockPath}?page=1&pageSize=50&createdAt=${formatISO(fromDate)}&commitIds=789&logSources=api&excludeErrors=true&days=30`,
    )
  })

  it('should ignore undefined or empty values', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        page: undefined,
        pageSize: 0,
        filterOptions: {
          createdAt: undefined,
          commitIds: [],
          logSources: [],
        },
      },
    })
    expect(result).toBe(mockPath)
  })

  it('should handle filterOptions with createdAt as empty string', () => {
    const result = generateDocumentLogsApiRouteWithParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: {
            // @ts-ignore - from and to are required
            from: undefined,
            to: undefined,
          },
          commitIds: [],
          logSources: [],
        },
      },
    })
    expect(result).toBe(mockPath)
  })
})
