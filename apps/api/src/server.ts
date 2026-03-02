import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { createLogger } from "@repo/observability"
import { config as loadDotenv } from "dotenv"
import { Effect } from "effect"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { honoErrorHandler } from "./middleware/error-handler.ts"
import { destroyTouchBuffer } from "./middleware/touch-buffer.ts"
import { registerRoutes } from "./routes/index.ts"

const nodeEnv = process.env.NODE_ENV || "development"
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url))
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath })

const app = new Hono()
const port = Effect.runSync(parseEnv(process.env.LAT_API_PORT, "number", 3001))
const logger = createLogger("api")

// Register global error handler
app.onError(honoErrorHandler)

// Parse CORS allowed origins from environment variable
// Format: comma-separated list of origins
// Example: LAT_CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
const parseAllowedOrigins = (): string[] => {
  const originsEnv = Effect.runSync(parseEnvOptional(process.env.LAT_CORS_ALLOWED_ORIGINS, "string"))

  if (originsEnv) {
    return originsEnv
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
  }

  // Fallback defaults for development if env var not set
  if (nodeEnv === "development") {
    return ["http://localhost:3000"]
  }

  // In production, require explicit configuration
  logger.warn("LAT_CORS_ALLOWED_ORIGINS not set, using empty whitelist (will reject all browser requests)")
  return []
}

const allowedOrigins = parseAllowedOrigins()

app.use(
  cors({
    origin: (origin, c) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return "*"

      // Strict whitelist check
      if (allowedOrigins.includes(origin)) {
        return origin
      }

      // Log suspicious origin attempts for security monitoring
      logger.warn(`CORS rejected origin: ${origin} for path: ${c.req.path}`)
      return null // Reject
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
    maxAge: 86400, // Cache preflight for 24 hours
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
  }),
)

registerRoutes({ app })

// Graceful shutdown handler
const handleShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`)

  // Flush pending touch buffer updates
  try {
    await destroyTouchBuffer()
    logger.info("Touch buffer flushed successfully")
  } catch (error) {
    logger.error(`Failed to flush touch buffer: ${error instanceof Error ? error.message : "Unknown error"}`)
  }

  logger.info("Graceful shutdown complete")
  process.exit(0)
}

// Register shutdown handlers
process.on("SIGTERM", () => handleShutdown("SIGTERM"))
process.on("SIGINT", () => handleShutdown("SIGINT"))

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(`api listening on http://localhost:${info.port}`)
  },
)
