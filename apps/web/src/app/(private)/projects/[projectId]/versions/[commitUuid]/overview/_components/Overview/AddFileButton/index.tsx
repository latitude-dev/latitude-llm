'use client'

import { BlankSlateButton } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/_components/BlankSlateButton'
import {
  EntityType,
  useNodeInput,
} from '$/components/Sidebar/Files/TreeToolbar'

export function AddFileButton() {
  const { setNodeInput } = useNodeInput()
  return (
    <BlankSlateButton
      title='Create a prompt from scratch'
      description='Start from a blank canvas: write your prompt, test, evaluate, and deploy it to production effortlessly.'
      onClick={() => setNodeInput(EntityType.Prompt)}
    />
  )
}
