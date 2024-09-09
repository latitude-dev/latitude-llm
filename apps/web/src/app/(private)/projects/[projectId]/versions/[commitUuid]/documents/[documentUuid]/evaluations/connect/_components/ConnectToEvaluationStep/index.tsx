import React, { useMemo, useState } from 'react'
import { xorBy } from 'lodash-es'

import {
  EvaluationDto,
  EvaluationTemplateWithCategory,
} from '@latitude-data/core/browser'
import { Button, Icon, TableWithHeader, Text } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'
import useEvaluationTemplates from '$/stores/evaluationTemplates'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import EvaluationEditor from './EvaluationEditor'
import EvaluationList from './EvaluationList'

type SelectableItem = {
  uuid: string
  name: string
  description: string
  type: 'evaluation' | 'template'
  data: EvaluationDto | EvaluationTemplateWithCategory
}

export default function ConnectEvaluationStep({
  selectedItems,
  setSelectedItems,
}: {
  selectedItems: string[]
  setSelectedItems: (items: string[]) => void
}) {
  const { documentUuid } = useParams()
  const { data: usedEvaluations } = useEvaluations({
    params: { documentUuid: documentUuid as string },
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
    setSelectedItems(
      selectedItems.includes(uuid)
        ? selectedItems.filter((id) => id !== uuid)
        : [...selectedItems, uuid],
    )
  }

  if (isLoadingEvaluations || isLoadingTemplates) return null

  return (
    <div className='flex flex-col pt-4 space-y-4'>
      <TableWithHeader
        title={<Text.H5M>Evaluations and Templates</Text.H5M>}
        actions={
          <Link href={ROUTES.evaluations.root}>
            <Button fancy variant='outline'>
              Create evaluation <Icon name='externalLink' />
            </Button>
          </Link>
        }
        table={
          <div className='flex space-x-4'>
            <EvaluationList
              items={filteredItems}
              selectedItems={selectedItems}
              onSelectItem={handleSelectItem}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
            <EvaluationEditor
              items={selectableItems.filter((item) =>
                selectedItems.includes(item.uuid),
              )}
            />
          </div>
        }
      />
    </div>
  )
}
