import { createRoute, type RouteConfig } from '@hono/zod-openapi'

export function defineRouteConfig<T extends Omit<RouteConfig, 'path'>>(
  route: T,
): T & { path: string } {
  return route as T & { path: string }
}

export function route<T extends Omit<RouteConfig, 'path'>>(r: T, path: string) {
  return createRoute({
    ...r,
    path,
  }) as T & { path: string }
}
