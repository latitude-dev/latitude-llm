'use client'

import { useCallback, useState } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import {
  Alert,
  Button,
  Icon,
  Modal,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { createDraftWithPromptlUpgradeAction } from '$/actions/commits/createDraftWithPromptlUpgrade'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { ROUTES } from '$/services/routes'
import useDocumentVersions from '$/stores/documentVersions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function UpgradeToPromptlModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
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
    ],
  )

  return (
    <Modal
      dismissible
      open={open}
      onOpenChange={onOpenChange}
      title='Upgrade syntax'
      description='We have updated the syntax for Latitude prompts!'
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

      <Alert
        variant='default'
        description={`If you choose to upgrade, ${upgradeConsequences}. You may have to edit the prompts in order to make them compatible with the new syntax.`}
      />

      <div className='flex flex-row w-full justify-end gap-2'>
        <Button
          variant='outline'
          fancy
          disabled={isUpgrading}
          onClick={() => upgradeDocument()}
        >
          Upgrade all prompts (recommended)
        </Button>
        <Button
          variant='default'
          fancy
          disabled={isUpgrading}
          onClick={() => upgradeDocument(document.documentUuid)}
        >
          Upgrade this prompt
        </Button>
      </div>
    </Modal>
  )
}

export function UpdateToPromptLButton({
  document,
}: {
  document: DocumentVersion
}) {
  if (document.promptlVersion !== 0) return null

  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant='shiny' size='small' onClick={() => setOpen(true)}>
        <Text.H5B color='primary'>Upgrade syntax</Text.H5B>
      </Button>
      <UpgradeToPromptlModal open={open} onOpenChange={setOpen} />
    </>
  )
}
