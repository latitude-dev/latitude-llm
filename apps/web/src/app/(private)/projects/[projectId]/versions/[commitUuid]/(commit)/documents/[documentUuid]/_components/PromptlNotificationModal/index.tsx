'use client'

import { DocumentVersion } from '@latitude-data/core/browser'
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
  documents,
}: {
  documents: DocumentVersion[]
}) {
  const { value: dismissedNotification, setValue: dismissNotification } =
    useLocalStorage({
      key: AppLocalStorage.dismissedDocumentPromptlNotification,
      defaultValue: false,
    })

  if (!documents.some((doc) => doc.promptlVersion === 0)) return null
  if (dismissedNotification) return null

  return (
    <Modal
      defaultOpen
      dismissible={false}
      open
      onOpenChange={() => dismissNotification(true)}
      title='Syntax Update Available'
      description='We have updated the syntax for Latitude prompts!'
      footer={
        <Button
          variant='default'
          fancy
          onClick={() => dismissNotification(true)}
        >
          Understood
        </Button>
      }
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
          <li>- Easier chains</li>
        </ul>
      </Text.H5>

      <Text.H5>All new prompts will be created using the new syntax.</Text.H5>

      <Text.H5>
        Current prompts will still use the old syntax to avoid breaking changes.
        However, you can upgrade your prompts to the new syntax at any time by
        clicking the{' '}
        <div className='inline-block bg-background p-1'>
          <Button variant='shiny' size='small'>
            <Text.H6 color='primary'>Upgrade syntax</Text.H6>
          </Button>
        </div>{' '}
        button in the prompt editor.
      </Text.H5>

      <Link href='https://promptl.ai'>
        <Button variant='link' className='p-0'>
          Learn more about Promptl.
          <Icon name='externalLink' />
        </Button>
      </Link>

      <Link href='https://docs.latitude.so/guides/prompt-manager/migrate-to-promptl'>
        <Button variant='link' className='p-0'>
          Learn how to migrate your prompt.
          <Icon name='externalLink' />
        </Button>
      </Link>
    </Modal>
  )
}
