import type { OpenAPIHono } from '@hono/zod-openapi'

import { swaggerUI } from '@hono/swagger-ui'

import packageJson from '../../package.json'
import { tags } from '$/openApi/tags'

export const openAPIObjectConfig = {
  openapi: '3.1.0',
  info: {
    title: 'Latitude API',
    version: packageJson.version,
  },
  tags: tags,
  security: [{ Bearer: [] }],
  externalDocs: {
    url: 'https://docs.latitude.so',
    description: 'Latitude Documentation',
  },
  servers: [
    /* { url: 'https://gateway.latitude.so', description: 'Production server' }, */
    { url: 'http://localhost:8787', description: 'Development server' },
  ],
}

export default function configureOpenAPI(app: OpenAPIHono) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'token',
    description: 'Latitude API Key',
  })
  app.doc31('/doc', openAPIObjectConfig)
  app.get('/ui', swaggerUI({ url: '/doc' }))
}
