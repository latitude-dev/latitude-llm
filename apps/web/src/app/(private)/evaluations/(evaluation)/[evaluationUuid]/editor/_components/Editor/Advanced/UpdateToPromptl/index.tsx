import { useCallback, useState } from 'react'

import {
  EvaluationDto,
  EvaluationMetadataLlmAsJudgeAdvanced,
} from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'

function UpgradeToPromptlModal({
  open,
  onOpenChange,
  setPromptlVersion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  evaluation: EvaluationDto & { metadata: EvaluationMetadataLlmAsJudgeAdvanced }
  setPromptlVersion: (version: number) => void
}) {
  const upgradeEvaluation = useCallback(async () => {
    setPromptlVersion(1)
    onOpenChange(false)
  }, [setPromptlVersion])

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Upgrade syntax'
      description='We have updated the syntax for Latitude prompts!'
      footer={
        <Button variant='default' fancy onClick={() => upgradeEvaluation()}>
          Upgrade evaluation
        </Button>
      }
    >
      <Text.H5>
        Since Latitude launched, we have been working on improving the syntax,
        addressing user feedback. The new syntax is called PromptL and it is
        designed to be more intuitive and easier to use.
      </Text.H5>

      <Text.H5>
        Some of the most notable changes include:
        <ul className='pl-4'>
          <li>- More intuitive conditional and loops</li>
          <li>- Support for custom XML tags</li>
        </ul>
      </Text.H5>

      <Link href='https://promptl.ai'>
        <Button variant='link' className='p-0'>
          Learn more about Promptl.
          <Icon name='externalLink' />
        </Button>
      </Link>

      <Link href='https://docs.latitude.so/guides/prompt-manager/migrate-to-promptl'>
        <Button variant='link' className='p-0'>
          Learn how to migrate your evaluation.
          <Icon name='externalLink' />
        </Button>
      </Link>

      <Alert
        variant='default'
        description={`When you upgrade, the editor will start evaluating your content with the new syntax. Once you save your changes, the new syntax will be applied to your evaluation. You might need to adjust the prompt to make it compatible with the new syntax.`}
      />
    </Modal>
  )
}

export function UpdateToPromptLButton({
  evaluation,
  setPromptlVersion,
}: {
  evaluation: EvaluationDto & { metadata: EvaluationMetadataLlmAsJudgeAdvanced }
  setPromptlVersion: (version: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant='shiny' size='small' onClick={() => setOpen(true)}>
        <Text.H5B color='primary'>Upgrade syntax</Text.H5B>
      </Button>
      <UpgradeToPromptlModal
        open={open}
        onOpenChange={setOpen}
        evaluation={evaluation}
        setPromptlVersion={setPromptlVersion}
      />
    </>
  )
}
