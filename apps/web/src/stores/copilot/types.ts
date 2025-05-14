export type CopilotChatInteractionStep =
  | string // Thoughts
  | {
      id: string
      description: string
      finishedDescription?: string
      finished: boolean
    } // Actions

export type CopilotChatInteraction = {
  input: string
  steps: CopilotChatInteractionStep[]
  output: string | undefined
}
