import type { OpenAPIHono } from '@hono/zod-openapi'

import { swaggerUI } from '@hono/swagger-ui'

import packageJson from '../../package.json'
import { tags } from '$/openApi/tags'
import { env } from '@latitude-data/env'

const port = env.GATEWAY_PORT
const url = port
  ? `${env.GATEWAY_SSL ? 'https' : 'http'}://${env.GATEWAY_HOSTNAME}:${env.GATEWAY_PORT}`
  : `${env.GATEWAY_SSL ? 'https' : 'http'}://${env.GATEWAY_HOSTNAME}`

const servers = [
  {
    url,
    description: 'Latitude',
  },
]

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
    '/api-docs',
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
