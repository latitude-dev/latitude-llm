import { LatteEditAction } from '@latitude-data/constants/latte'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'

interface ILatteInteractionStep {
  type: 'thought' | 'tool' | 'action'
}

export type LatteThoughtStep = ILatteInteractionStep & {
  type: 'thought'
  content: string
}
export type LatteToolStep = ILatteInteractionStep & {
  type: 'tool'
  id: string
  toolName: string
  parameters: Record<string, unknown>
  activeDescription: string
  finishedDescription?: string
  finished: boolean
  customIcon?: IconName
}
export type LatteActionStep = ILatteInteractionStep & {
  type: 'action'
  action: LatteEditAction
}

export type LatteTextStep = {
  type: 'text'
  text: string
}

export type LatteStepGroupItem =
  | LatteThoughtStep
  | LatteToolStep
  | LatteActionStep

export type LatteStepGroup = {
  type: 'group'
  steps: LatteStepGroupItem[]
}

export type LatteInteractionStep = LatteStepGroup | LatteTextStep

export type LatteInteraction = {
  input: string
  steps: LatteInteractionStep[]
  output?: string
}
