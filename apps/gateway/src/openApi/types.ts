import type { RouteConfig, RouteHandler } from '@hono/zod-openapi'

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R>
