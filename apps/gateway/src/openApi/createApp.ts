import { OpenAPIHono } from '@hono/zod-openapi'

export function createRouter() {
  return new OpenAPIHono({ strict: false })
}

export default function createApp() {
  return new OpenAPIHono({ strict: false })
}
