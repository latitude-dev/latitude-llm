'use client'

import {
  EvaluationDto,
  EvaluationMetadataType,
} from '@latitude-data/core/browser'
import {
  AppLocalStorage,
  Button,
  Icon,
  Modal,
  Text,
  useLocalStorage,
} from '@latitude-data/web-ui'
import Link from 'next/link'

export function PromptlNotificationModal({
  evaluation,
}: {
  evaluation: EvaluationDto
}) {
  const { value: dismissedNotification, setValue: dismissNotification } =
    useLocalStorage({
      key: AppLocalStorage.dismissedEvaluationPromptlNotification,
      defaultValue: false,
    })

  if (
    evaluation.metadataType !== EvaluationMetadataType.LlmAsJudgeAdvanced ||
    evaluation.metadata.promptlVersion !== 0 ||
    dismissedNotification
  ) {
    return null
  }

  return (
    <Modal
      defaultOpen
      dismissible={false}
      open
      onOpenChange={() => dismissNotification(true)}
      title='Syntax Update Available'
      description='We have updated the syntax for Latitude prompts!'
    >
      <Text.H5>
        Since Latitude launched, we have been working on improving the syntax.
        The new syntax is called PromptL and it is designed to be more intuitive
        and easier to use.
      </Text.H5>

      <Text.H5>
        Some of the most notable changes include:
        <ul className='pl-4'>
          <li>- More intuitive conditional and loops</li>
          <li>- Support for custom XML tags</li>
        </ul>
      </Text.H5>

      <Text.H5>
        All new advanced evaluations will be created using the new syntax.
      </Text.H5>

      <Text.H5>
        Current evaluations will still use the old syntax to avoid breaking
        changes. However, you can upgrade your evaluations to the new syntax at
        any time by clicking the{' '}
        <div className='inline-block bg-background p-1'>
          <Button variant='shiny' size='small'>
            <Text.H6 color='primary'>Upgrade syntax</Text.H6>
          </Button>
        </div>{' '}
        button in the evaluation editor.
      </Text.H5>

      <Link href='https://promptl.ai'>
        <Button variant='link' className='p-0'>
          Learn more about Promptl.
          <Icon name='externalLink' />
        </Button>
      </Link>

      <Link href='https://docs.latitude.so/guides/prompt-manager/migrate-to-promptl'>
        <Button variant='link' className='p-0'>
          Learn how to migrate your evaluation prompt.
          <Icon name='externalLink' />
        </Button>
      </Link>

      <div className='flex flex-row w-full justify-end gap-2'>
        <Button
          variant='default'
          fancy
          onClick={() => dismissNotification(true)}
        >
          Understood
        </Button>
      </div>
    </Modal>
  )
}
