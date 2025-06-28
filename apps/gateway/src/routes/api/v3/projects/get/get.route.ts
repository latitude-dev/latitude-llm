import { FastifyInstance } from 'fastify'
import { GetProjectHandler } from './get.handler'
import { Static, Type } from '@sinclair/typebox'

const ParamsSchema = Type.Object({
  projectId: Type.Number(),
})

type Params = Static<typeof ParamsSchema>

// We can define a schema for the response as well, for better type safety and documentation
const ReplySchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  // Add other project properties here
})

// Define the actual route configuration for openapi
export const getRoute = {
  method: 'GET',
  url: '/projects/:projectId',
  schema: {
    params: ParamsSchema,
    response: {
      200: ReplySchema,
      // Add other response schemas if needed, e.g., for 404
    },
  },
  handler: getHandler, // This will be getHandler from get.handler.ts
}

// The default export is not strictly necessary if using createRouter pattern,
// but can be kept for consistency or if direct registration is used elsewhere.
export default async function (fastify: FastifyInstance) {
  fastify.get<{ Params: Params }>(
    '/projects/:projectId',
    {
      schema: {
        params: ParamsSchema,
        response: {
          200: ReplySchema,
        },
      },
    },
    GetProjectHandler,
  )
}
