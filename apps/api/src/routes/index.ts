import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { createApiKeyPostgresRepository, createMembershipPostgresRepository } from "@platform/db-postgres"
import { Hono } from "hono"
import { getPostgresClient } from "../clients.ts"
import { createAuthMiddleware } from "../middleware/auth.ts"
import { createAuthRateLimiter } from "../middleware/rate-limiter.ts"
import { createTouchBuffer } from "../middleware/touch-buffer.ts"
import { createApiKeysRoutes } from "./api-keys.ts"
import { createAuthRoutes } from "./auth.ts"
import { registerHealthRoute } from "./health.ts"
import { createOrganizationsRoutes } from "./organizations.ts"
import { createProjectsRoutes } from "./projects.ts"

interface RoutesContext {
  app: Hono
}

/**
 * Register all API routes with versioning.
 *
 * Wires up all route handlers under versioned paths.
 * - /health - Unversioned health check
 * - /v1/* - Version 1 API routes
 *
 * Authentication middleware is applied to all /v1 routes except:
 * - /v1/auth/* (authentication endpoints themselves)
 */
export const registerRoutes = (context: RoutesContext) => {
  const { app } = context
  const { db } = getPostgresClient()

  // Health check route (unversioned - no auth required)
  registerHealthRoute(context)

  // Version 1 API routes
  const v1 = new Hono()

  // Auth routes (Better Auth) - PUBLIC, no auth required
  v1.route("/auth", createAuthRoutes())

  // Protected routes - auth middleware required
  const protectedRoutes = new Hono()

  // Initialize Redis client for rate limiting and API key caching
  const redisConn = createRedisConnection()
  const redis = createRedisClient(redisConn)

  // Create repositories
  const apiKeyRepository = createApiKeyPostgresRepository(db)
  const membershipRepository = createMembershipPostgresRepository(db)

  // Create touch buffer for batching API key lastUsedAt updates
  // This reduces database writes by 90%+ by batching updates every 30 seconds
  const touchBuffer = createTouchBuffer(apiKeyRepository, { intervalMs: 30000 })

  // Create rate limiter and auth middleware
  const authRateLimiter = createAuthRateLimiter(redis)
  const authMiddleware = createAuthMiddleware(apiKeyRepository, membershipRepository, redis, touchBuffer)

  // Apply rate limiting before auth middleware to prevent brute force attacks
  protectedRoutes.use("*", authRateLimiter)

  // Apply auth middleware to all protected routes
  protectedRoutes.use("*", authMiddleware)

  // Organization routes (protected)
  protectedRoutes.route("/", createOrganizationsRoutes())

  // Project routes (nested under organizations, protected)
  protectedRoutes.route("/:organizationId/projects", createProjectsRoutes())

  // API Key routes (nested under organizations, protected)
  protectedRoutes.route("/:organizationId/api-keys", createApiKeysRoutes(redis))

  // Mount protected routes
  v1.route("/organizations", protectedRoutes)

  // Mount v1 routes under /v1 prefix
  app.route("/v1", v1)
}
