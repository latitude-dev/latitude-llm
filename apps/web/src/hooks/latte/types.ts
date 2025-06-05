import { LatteEditAction } from '@latitude-data/constants/latte'

interface ILatteInteractionStep {
  type: 'thought' | 'tool' | 'action'
}

type LatteThoughtStep = ILatteInteractionStep & {
  type: 'thought'
  content: string
}
type LatteToolStep = ILatteInteractionStep & {
  type: 'tool'
  id: string
  toolName: string
  parameters: Record<string, unknown>
  activeDescription: string
  finishedDescription?: string
  finished: boolean
}
type LatteActionStep = ILatteInteractionStep & {
  type: 'action'
  action: LatteEditAction
}

export type LatteInteractionStep =
  | LatteThoughtStep
  | LatteToolStep
  | LatteActionStep

export type LatteInteraction = {
  input: string
  steps: LatteInteractionStep[]
  output: string | undefined
}
