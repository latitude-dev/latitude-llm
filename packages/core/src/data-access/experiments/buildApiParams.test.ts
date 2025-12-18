import { formatISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { LogSources } from '../../constants'
import { buildExperimentsApiParams } from './buildApiParams'

// Fake api
const mockPath = '/api/experiments'

describe('buildExperimentsApiParams', () => {
  it('should generate a URL with no params', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {},
    })
    expect(result).toBe(mockPath)
  })

  it('should handle page and pageSize', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: { page: 1, pageSize: 20 },
    })
    expect(result).toBe(`${mockPath}?page=1&pageSize=20`)
  })

  it('should handle excludeErrors and days', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: { excludeErrors: true, days: 7 },
    })
    expect(result).toBe(`${mockPath}?excludeErrors=true&days=7`)
  })

  it('should handle filterOptions with createdAt (only from date)', () => {
    const fromDate = new Date('2024-01-01')
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: { from: fromDate, to: undefined },
          commitIds: [],
          logSources: [],
          customIdentifier: undefined,
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(`${mockPath}?createdAt=${formatISO(fromDate)}`)
  })

  it('should handle filterOptions with createdAt (from and to date)', () => {
    const fromDate = new Date('2024-01-01')
    const toDate = new Date('2024-01-10')
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: { from: fromDate, to: toDate },
          commitIds: [],
          logSources: [],
          customIdentifier: undefined,
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(
      `${mockPath}?createdAt=${formatISO(fromDate)},${formatISO(toDate)}`,
    )
  })

  it('should handle filterOptions with empty commitIds and logSources', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: undefined,
          commitIds: [],
          logSources: [],
          customIdentifier: undefined,
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(`${mockPath}`)
  })

  it('should handle filterOptions with non-empty commitIds and logSources', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: undefined,
          commitIds: [123, 456],
          logSources: [LogSources.API, LogSources.User],
          customIdentifier: undefined,
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(`${mockPath}?commitIds=123,456&logSources=api,user`)
  })

  it('should handle filterOptions with non-empty customIdentifier', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: undefined,
          commitIds: [],
          logSources: [],
          customIdentifier: 'thís shóùld be encoded',
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(
      `${mockPath}?customIdentifier=th%C3%ADs%20sh%C3%B3%C3%B9ld%20be%20encoded`,
    )
  })

  it('should handle mixed parameters', () => {
    const fromDate = new Date('2024-01-01')
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        page: 1,
        pageSize: 50,
        filterOptions: {
          createdAt: { from: fromDate, to: undefined },
          commitIds: [789],
          logSources: [LogSources.API],
          customIdentifier: '8861c3a3-4728-4818-9259-769f121a2fc6',
          experimentId: undefined,
        },
        excludeErrors: true,
        days: 30,
      },
    })
    expect(result).toBe(
      `${mockPath}?page=1&pageSize=50&excludeErrors=true&days=30&createdAt=${formatISO(fromDate)}&commitIds=789&logSources=api&customIdentifier=8861c3a3-4728-4818-9259-769f121a2fc6`,
    )
  })

  it('should ignore undefined or empty values', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        page: undefined,
        pageSize: 0,
        filterOptions: {
          createdAt: undefined,
          commitIds: [],
          logSources: [],
          customIdentifier: undefined,
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(mockPath)
  })

  it('should handle filterOptions with createdAt as empty string', () => {
    const result = buildExperimentsApiParams({
      path: mockPath,
      params: {
        filterOptions: {
          createdAt: {
            from: undefined,
            to: undefined,
          },
          commitIds: [],
          logSources: [],
          customIdentifier: undefined,
          experimentId: undefined,
        },
      },
    })
    expect(result).toBe(mockPath)
  })
})
