import type { OpenAPIHono } from '@hono/zod-openapi'

import { swaggerUI } from '@hono/swagger-ui'

import packageJson from '../../package.json'
import { tags } from '$/openApi/tags'

const isDev = process.env.NODE_ENV === 'development'
let servers = [
  { url: 'https://gateway.latitude.so', description: 'Latitude production' },
]

if (isDev) {
  servers = [
    { url: 'http://localhost:8787', description: 'Latitude development' },
    ...servers,
  ]
}

export const openAPIObjectConfig = {
  openapi: '3.1.0',
  info: { title: 'Latitude API', version: packageJson.version },
  tags: tags,
  security: [{ Bearer: [] }],
  externalDocs: {
    url: 'https://docs.latitude.so',
    description: 'Latitude Documentation',
  },
  servers,
}

export default function configureOpenAPI(app: OpenAPIHono) {
  app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'token',
    description: 'Latitude API Key',
  })

  app.doc31('/doc', openAPIObjectConfig)
  app.get(
    '/ui',
    swaggerUI({
      url: '/doc',
      docExpansion: 'list',
      requestSnippetsEnabled: true,
      syntaxHighlight: {
        activated: true,
        theme: ['nord'],
      },
    }),
  )
}
