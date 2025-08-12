import { useCallback, useState } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { createDraftWithPromptlUpgradeAction } from '$/actions/commits/createDraftWithPromptlUpgrade'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function UpgradeToPromptlModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { project } = useCurrentProject()

  const { mutate } = useDocumentVersions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })

  const { execute: createDraftWithPromptlUpgrade } = useLatitudeAction(
    createDraftWithPromptlUpgradeAction,
  )

  const upgradeConsequences = commit.mergedAt
    ? 'a new draft version will be created where the selected prompts will begin to be evaluated with the new prompt syntax'
    : 'the selected prompts will begin to be evaluated with the new prompt syntax in this draft'

  const [isUpgrading, setIsUpgrading] = useState(false)

  const upgradeDocument = useCallback(
    async (documentUuid?: string) => {
      if (isUpgrading) return
      setIsUpgrading(true)

      const [newDraft, error] = await createDraftWithPromptlUpgrade({
        projectId: project.id,
        documentUuid,
        draftUuid: commit.mergedAt ? undefined : commit.uuid,
      })

      if (error) {
        setIsUpgrading(false)
        return
      }

      if (commit.uuid === newDraft.uuid) {
        await mutate((prevDocs) =>
          prevDocs?.map((doc) => {
            const promptlVersion = documentUuid
              ? doc.documentUuid === documentUuid
                ? 1
                : doc.promptlVersion
              : 1

            return {
              ...doc,
              promptlVersion,
            }
          }),
        )
      } else {
        router.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: newDraft.uuid })
            .documents.detail({ uuid: document.documentUuid }).root,
        )
      }
    },
    [
      isUpgrading,
      project.id,
      document.documentUuid,
      commit.uuid,
      commit.mergedAt,
      createDraftWithPromptlUpgrade,
      mutate,
      router,
    ],
  )

  return (
    <ConfirmModal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Upgrade syntax'
      description='We have updated the syntax for Latitude prompts!'
      confirm={{
        label: 'Upgrade this prompt',
        isConfirming: isUpgrading,
        title: 'Upgrade this prompt',
        description: `If you choose to upgrade, ${upgradeConsequences}. You may have to edit the prompts in order to make them compatible with the new syntax.`,
      }}
      cancel={{ label: 'Upgrade all prompts (recommended)' }}
      onCancel={() => upgradeDocument()}
      onConfirm={() => upgradeDocument(document.documentUuid)}
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
          <li>- Easier chains</li>
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
          Learn how to migrate your prompt.
          <Icon name='externalLink' />
        </Button>
      </Link>
    </ConfirmModal>
  )
}

export function UpdateToPromptLButton({
  document,
}: {
  document: DocumentVersion
}) {
  const [open, setOpen] = useState(false)

  if (document.promptlVersion !== 0) return null

  return (
    <>
      <Button variant='shiny' size='small' onClick={() => setOpen(true)}>
        <Text.H5B color='primary'>Upgrade syntax</Text.H5B>
      </Button>
      <UpgradeToPromptlModal open={open} onOpenChange={setOpen} />
    </>
  )
}
