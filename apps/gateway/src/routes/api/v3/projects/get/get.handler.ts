import { FastifyReply, FastifyRequest } from 'fastify'
import { ProjectsRepository } from '@latitude-data/core' // Assuming this is the correct path
import { Static, Type } from '@sinclair/typebox'

const ParamsSchema = Type.Object({
  projectId: Type.Number(),
})

type Params = Static<typeof ParamsSchema>

export const getHandler = async (
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply,
) => {
  const { projectId } = request.params
  const projectsRepository = new ProjectsRepository(
    // @ts-expect-error - db is not available on the class
    request.server.db,
    request.workspaceId,
  )

  const projectResult = await projectsRepository.getProjectById(projectId)

  if (projectResult.isErr()) {
    return reply.status(404).send({ message: 'Project not found' })
  }

  return reply.send(projectResult.value)
}
