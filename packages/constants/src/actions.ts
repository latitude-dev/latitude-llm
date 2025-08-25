import { z } from 'zod'

export enum ActionType {
  CreateAgent = 'create-agent',
  CloneAgent = 'clone-agent',
}

export const createAgentActionBackendParametersSchema = z.object({
  prompt: z.string(),
})
export type CreateAgentActionBackendParameters = z.infer<
  typeof createAgentActionBackendParametersSchema
>

export const createAgentActionFrontendParametersSchema = z.object({
  projectId: z.number(),
  commitUuid: z.string(),
  prompt: z.string(),
})
export type CreateAgentActionFrontendParameters = z.infer<
  typeof createAgentActionFrontendParametersSchema
>

export const cloneAgentActionBackendParametersSchema = z.object({
  uuid: z.string(),
})
export type CloneAgentActionBackendParameters = z.infer<
  typeof cloneAgentActionBackendParametersSchema
>

export const cloneAgentActionFrontendParametersSchema = z.object({
  projectId: z.number(),
  commitUuid: z.string(),
})
export type CloneAgentActionFrontendParameters = z.infer<
  typeof cloneAgentActionFrontendParametersSchema
>

// prettier-ignore
export type ActionBackendParameters<T extends ActionType = ActionType> =
  T extends ActionType.CreateAgent
    ? CreateAgentActionBackendParameters
    : T extends ActionType.CloneAgent
      ? CloneAgentActionBackendParameters
      : never

// prettier-ignore
export type ActionFrontendParameters<T extends ActionType = ActionType> =
  T extends ActionType.CreateAgent
    ? CreateAgentActionFrontendParameters
    : T extends ActionType.CloneAgent
      ? CloneAgentActionFrontendParameters
      : never
