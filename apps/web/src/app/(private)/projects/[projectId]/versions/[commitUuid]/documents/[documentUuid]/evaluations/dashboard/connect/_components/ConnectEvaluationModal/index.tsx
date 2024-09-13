'use client'

import { useCallback, useMemo, useState } from 'react'
import { xorBy } from 'lodash-es'

import {
  EvaluationDto,
  EvaluationTemplateCategory,
} from '@latitude-data/core/browser'
import {
  Button,
  CloseTrigger,
  Icon,
  Modal,
  TableWithHeader,
  Text,
} from '@latitude-data/web-ui'
import { connectEvaluationsAction } from '$/actions/evaluations/connect'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import useEvaluationTemplates from '$/stores/evaluationTemplates'
import Link from 'next/link'

import EvaluationEditor from './Editor'
import EvaluationList from './List'

type SelectableItem = {
  uuid: string
  name: string
  description: string
  type: 'evaluation' | 'template'
  data: EvaluationDto | EvaluationTemplateCategory
}

export default function ConnectionEvaluationModal({
  projectId,
  commitUuid,
  documentUuid,
}: {
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const [selectedItem, setSelectedItem] = useState<string>()
  const { execute, isPending: isConnecting } = useLatitudeAction(
    connectEvaluationsAction,
  )
  const navigate = useNavigate()
  const { data: usedEvaluations, mutate } = useEvaluations({
    params: { documentUuid },
  })
  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluations()
  const { data: templates, isLoading: isLoadingTemplates } =
    useEvaluationTemplates()
  const [searchTerm, setSearchTerm] = useState('')

  const selectableItems: SelectableItem[] = useMemo(() => {
    const evaluationItems = xorBy(
      evaluations,
      usedEvaluations,
      (ev) => ev.id,
    ).map((e) => ({
      uuid: e.uuid,
      name: e.name,
      description: e.description,
      type: 'evaluation' as const,
      data: e,
    }))
    const templateItems = templates.map((t) => ({
      uuid: t.id.toString(),
      name: t.name,
      description: t.description,
      type: 'template' as const,
      data: t,
    }))
    return [...evaluationItems, ...templateItems]
  }, [evaluations, usedEvaluations, templates])

  const filteredItems = useMemo(() => {
    return selectableItems.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }, [selectableItems, searchTerm])

  const handleSelectItem = (uuid: string) => {
    setSelectedItem(selectableItems.find((item) => item.uuid === uuid)?.uuid)
  }

  const createConnection = useCallback(async () => {
    const templateId = templates?.find(
      (template) => template.id.toString() === selectedItem,
    )?.id
    const evaluationUuid = evaluations.find(
      (evaluation) => evaluation.uuid === selectedItem,
    )?.uuid

    const [data] = await execute({
      projectId,
      templateIds: templateId ? [templateId] : [],
      evaluationUuids: evaluationUuid ? [evaluationUuid] : [],
      documentUuid,
    })

    if (data) {
      mutate()
      const connectedEvaluation = data[0]!
      navigate.push(
        ROUTES.projects
          .detail({ id: Number(projectId) })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: documentUuid })
          .evaluations.detail(connectedEvaluation.evaluationId).root,
      )
    }
  }, [execute, projectId, documentUuid, selectedItem, templates, evaluations])

  const isLoadingList = isLoadingEvaluations || isLoadingTemplates
  const item = selectableItems.find((item) => item.uuid === selectedItem)
  return (
    <Modal
      open
      size='large'
      title='Which evaluations do you want to connect?'
      description='What data do you want to analyze?'
      onOpenChange={() => {
        navigate.push(
          ROUTES.projects
            .detail({ id: Number(projectId) })
            .commits.detail({ uuid: commitUuid })
            .documents.detail({ uuid: documentUuid }).evaluations.root,
        )
      }}
      footer={
        <>
          <CloseTrigger />
          <Button
            fancy
            disabled={!selectedItem || isConnecting}
            onClick={createConnection}
          >
            Connect Evaluation
          </Button>
        </>
      }
    >
      <div className='flex flex-col pt-4 space-y-4'>
        <TableWithHeader
          title={<Text.H5M>Evaluations and Templates</Text.H5M>}
          actions={
            <Link href={ROUTES.evaluations.root} target='_blank'>
              <Button fancy variant='outline'>
                Create evaluation <Icon name='externalLink' />
              </Button>
            </Link>
          }
          table={
            <div className='flex space-x-4'>
              {!isLoadingList ? (
                <EvaluationList
                  items={filteredItems}
                  selectedItem={selectedItem}
                  onSelectItem={handleSelectItem}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                />
              ) : null}
              <EvaluationEditor items={item ? [item] : []} />
            </div>
          }
        />
      </div>
    </Modal>
  )
}
