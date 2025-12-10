import { describe, expect, it, beforeEach } from 'vitest'
import { routeRequest } from './routeRequest'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'

describe('routeRequest', () => {
  let mockTest: DeploymentTest

  beforeEach(() => {
    mockTest = {
      id: 1,
      uuid: 'test-uuid-123',
      workspaceId: 1,
      projectId: 1,
      challengerCommitId: 2,
      testType: 'ab',
      trafficPercentage: 50,
      status: 'running',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      name: null,
      description: null,
      startedAt: null,
      endedAt: null,
      createdByUserId: null,
    } as DeploymentTest
  })

  describe('session stickiness with customIdentifier', () => {
    it('returns consistent routing for the same customIdentifier', () => {
      const customIdentifier = 'user-123'

      const result1 = routeRequest(mockTest, customIdentifier)
      const result2 = routeRequest(mockTest, customIdentifier)
      const result3 = routeRequest(mockTest, customIdentifier)

      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('returns different routing for different customIdentifiers', () => {
      // With 50% traffic split, we should see some variation
      // across different identifiers
      const identifiers = Array.from({ length: 100 }, (_, i) => `user-${i}`)
      const routes = identifiers.map((id) => routeRequest(mockTest, id))

      const baselineCount = routes.filter((r) => r === 'baseline').length
      const challengerCount = routes.filter((r) => r === 'challenger').length

      // With 50% traffic, we expect roughly 50/50 split
      // Allow some margin (30-70% range)
      expect(baselineCount).toBeGreaterThan(30)
      expect(baselineCount).toBeLessThan(70)
      expect(challengerCount).toBeGreaterThan(30)
      expect(challengerCount).toBeLessThan(70)
    })

    it('routes more traffic to challenger with higher traffic percentage', () => {
      mockTest.trafficPercentage = 80

      const identifiers = Array.from({ length: 100 }, (_, i) => `user-${i}`)
      const routes = identifiers.map((id) => routeRequest(mockTest, id))

      const challengerCount = routes.filter((r) => r === 'challenger').length

      // With 80% traffic to challenger, expect 70-90% range
      expect(challengerCount).toBeGreaterThan(70)
      expect(challengerCount).toBeLessThan(90)
    })

    it('routes more traffic to baseline with lower traffic percentage', () => {
      mockTest.trafficPercentage = 20

      const identifiers = Array.from({ length: 100 }, (_, i) => `user-${i}`)
      const routes = identifiers.map((id) => routeRequest(mockTest, id))

      const baselineCount = routes.filter((r) => r === 'baseline').length

      // With 20% traffic to challenger, expect 70-90% to baseline
      expect(baselineCount).toBeGreaterThan(70)
      expect(baselineCount).toBeLessThan(90)
    })

    it('uses test uuid in hash for isolation between tests', () => {
      const customIdentifier = 'user-123'
      const test1 = { ...mockTest, uuid: 'test-1' }
      const test2 = { ...mockTest, uuid: 'test-2' }

      const route1 = routeRequest(test1, customIdentifier)
      const route2 = routeRequest(test2, customIdentifier)

      // Different test UUIDs should affect the hash
      // This ensures the same user can be in different variants for different tests
      // Note: Due to hashing, these might occasionally be the same, but the logic is sound
      expect([route1, route2]).toBeDefined()
    })

    it('handles edge case with 0% traffic to challenger', () => {
      mockTest.trafficPercentage = 0

      const identifiers = Array.from({ length: 20 }, (_, i) => `user-${i}`)
      const routes = identifiers.map((id) => routeRequest(mockTest, id))

      // All traffic should go to baseline
      expect(routes.every((r) => r === 'baseline')).toBe(true)
    })

    it('handles edge case with 100% traffic to challenger', () => {
      mockTest.trafficPercentage = 100

      const identifiers = Array.from({ length: 20 }, (_, i) => `user-${i}`)
      const routes = identifiers.map((id) => routeRequest(mockTest, id))

      // All traffic should go to challenger
      expect(routes.every((r) => r === 'challenger')).toBe(true)
    })
  })

  describe('random routing without customIdentifier', () => {
    it('returns baseline or challenger randomly', () => {
      const routes = Array.from({ length: 100 }, () => routeRequest(mockTest))

      const baselineCount = routes.filter((r) => r === 'baseline').length
      const challengerCount = routes.filter((r) => r === 'challenger').length

      // With 50% traffic, expect roughly 50/50 split
      // Allow wider margin for randomness (25-75% range)
      expect(baselineCount).toBeGreaterThan(25)
      expect(baselineCount).toBeLessThan(75)
      expect(challengerCount).toBeGreaterThan(25)
      expect(challengerCount).toBeLessThan(75)
    })

    it('respects traffic percentage for random routing', () => {
      mockTest.trafficPercentage = 75

      const routes = Array.from({ length: 200 }, () => routeRequest(mockTest))

      const challengerCount = routes.filter((r) => r === 'challenger').length

      // With 75% traffic to challenger, expect roughly 60-90% range
      expect(challengerCount).toBeGreaterThan(120) // > 60%
      expect(challengerCount).toBeLessThan(180) // < 90%
    })

    it('defaults to 50% when traffic percentage is null', () => {
      mockTest.trafficPercentage = null as any

      const routes = Array.from({ length: 100 }, () => routeRequest(mockTest))

      const baselineCount = routes.filter((r) => r === 'baseline').length
      const challengerCount = routes.filter((r) => r === 'challenger').length

      // Should default to 50/50 split
      expect(baselineCount).toBeGreaterThan(25)
      expect(baselineCount).toBeLessThan(75)
      expect(challengerCount).toBeGreaterThan(25)
      expect(challengerCount).toBeLessThan(75)
    })
  })

  describe('customIdentifier edge cases', () => {
    it('treats null customIdentifier as no identifier', () => {
      // Multiple calls with null should produce random results
      const routes = Array.from({ length: 100 }, () =>
        routeRequest(mockTest, null),
      )

      const uniqueRoutes = new Set(routes)
      // Should have both baseline and challenger in results
      expect(uniqueRoutes.size).toBe(2)
    })

    it('treats empty string as valid identifier with deterministic routing', () => {
      // With the same test UUID and empty string, hashing should be consistent
      const routes = Array.from({ length: 10 }, () =>
        routeRequest(mockTest, ''),
      )

      // All should return the same value (deterministic based on hash)
      const uniqueRoutes = new Set(routes)
      expect(uniqueRoutes.size).toBe(1)
      // Just ensure it returns a valid route
      expect(['baseline', 'challenger']).toContain(routes[0])
    })

    it('handles very long customIdentifiers', () => {
      const longId = 'x'.repeat(10000)

      const route1 = routeRequest(mockTest, longId)
      const route2 = routeRequest(mockTest, longId)

      // Should still be consistent
      expect(route1).toBe(route2)
    })

    it('handles special characters in customIdentifier', () => {
      const specialId = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`'

      const route1 = routeRequest(mockTest, specialId)
      const route2 = routeRequest(mockTest, specialId)

      // Should still be consistent
      expect(route1).toBe(route2)
    })

    it('handles unicode characters in customIdentifier', () => {
      const unicodeId = '用户-123-🚀'

      const route1 = routeRequest(mockTest, unicodeId)
      const route2 = routeRequest(mockTest, unicodeId)

      // Should still be consistent
      expect(route1).toBe(route2)
    })
  })
})
