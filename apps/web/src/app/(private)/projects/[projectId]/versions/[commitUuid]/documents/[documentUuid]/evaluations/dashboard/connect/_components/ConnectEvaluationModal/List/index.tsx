import React from 'react'

import {
  Input,
  SelectableCard,
  Skeleton,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import useCurrentWorkspace from '$/stores/currentWorkspace'
import Link from 'next/link'

interface EvaluationListProps {
  items: {
    uuid: string
    name: string
    description: string
    type: 'evaluation' | 'template'
  }[]
  selectedItem: string | undefined
  onSelectItem: (uuid: string) => void
  searchTerm: string
  onSearchChange: (term: string) => void
}

export function EvaluationList({
  items,
  selectedItem,
  onSelectItem,
  searchTerm,
  onSearchChange,
}: EvaluationListProps) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useCurrentDocument()
  const workspace = useCurrentWorkspace()

  return (
    <div className='w-1/2 max-h-[520px] overflow-y-auto'>
      <Input
        type='text'
        placeholder='Search evaluations and templates...'
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className='w-full p-2 mb-4 border rounded-lg'
      />

      <div className='space-y-6'>
        {workspace.data.id === 3 && (
          <div className='flex flex-col gap-2'>
            <Text.H6M color='foregroundMuted'>Suggested</Text.H6M>
            <Link
              href={
                ROUTES.projects
                  .detail({ id: project.id })
                  .commits.detail({ uuid: commit.uuid })
                  .documents.detail({ uuid: document.documentUuid }).evaluations
                  .dashboard.generate.root
              }
            >
              <div className='flex flex-col gap-2 p-2 rounded-lg border hover:bg-secondary'>
                <Text.H5M>AI generated eval</Text.H5M>
                <Text.H6 color='foregroundMuted'>
                  Our AI will craft an evaluation template just for this
                  specific prompt. Try it out!
                </Text.H6>
              </div>
            </Link>
          </div>
        )}
        {items.length > 0 && (
          <div className='flex flex-col gap-2'>
            <Text.H6M color='foregroundMuted'>Templates</Text.H6M>
            <ul className='space-y-2'>
              {items.map((item) => (
                <SelectableCard
                  key={item.uuid}
                  title={item.name}
                  description={item.description}
                  selected={item.uuid === selectedItem}
                  onClick={() => onSelectItem(item.uuid)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
      {items.length === 0 && (
        <div className='text-center'>
          <Text.H6 color='foregroundMuted'>
            No evaluations or templates found
          </Text.H6>
        </div>
      )}
    </div>
  )
}

export function LoadingEvaluationList({ items = 6 }: { items?: number }) {
  return (
    <div className='w-1/2 max-h-[520px] overflow-y-auto'>
      <Input
        type='text'
        placeholder='Search evaluations and templates...'
        disabled
        className='w-full p-2 mb-4 border rounded-lg'
      />
      <ul className='space-y-2'>
        {Array.from({ length: items }).map((_, i) => (
          <Skeleton key={i} className='w-full h-16' />
        ))}
      </ul>
    </div>
  )
}
