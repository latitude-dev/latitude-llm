'use client'

import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { LogicTablePaginationFooter } from '$/components/TablePaginationFooter/LogicTablePaginationFooter'
import { useOptimizations, useOptimizationsCount } from '$/stores/optimizations'
import { Pagination } from '@latitude-data/core/helpers'
import { OptimizationWithDetails } from '@latitude-data/core/schema/types'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ConfirmModal } from '@latitude-data/web-ui/atoms/Modal'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import {
  BlankSlateStep,
  BlankSlateWithSteps,
} from '@latitude-data/web-ui/molecules/BlankSlateWithSteps'
import { cn } from '@latitude-data/web-ui/utils'
import { RefObject, useCallback, useState } from 'react'
import { BaselineCell } from './BaselineCell'
import { DatasetsCell } from './DatasetsCell'
import { EvaluationCell } from './EvaluationCell'
import { OptimizedCell } from './OptimizedCell'
import { getOptimizationPhase } from './shared'
import { StartedAtCell } from './StartedAtCell'
import { StatusCell } from './StatusCell'

function OptimizationRow({
  optimization,
  isSelected,
  onRowClick,
  onCancelClick,
}: {
  optimization: OptimizationWithDetails
  isSelected: boolean
  onRowClick: () => void
  onCancelClick: () => void
}) {
  const { commit } = useCurrentCommit()

  const phase = getOptimizationPhase(optimization)

  return (
    <TableRow
      className={cn(
        'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors',
        {
          'bg-secondary': isSelected,
          'cursor-default': phase.isActive,
        },
      )}
      onClick={phase.isCompleted ? onRowClick : undefined}
    >
      <TableCell className='!w-52 !min-w-52 !max-w-52'>
        <StatusCell optimization={optimization} onCancelClick={onCancelClick} />
      </TableCell>
      <TableCell>
        <EvaluationCell
          evaluation={optimization.evaluation}
          commitUuid={optimization.baselineCommit?.uuid ?? commit.uuid}
          hasError={phase.hasError}
        />
      </TableCell>
      <TableCell>
        <DatasetsCell
          trainset={optimization.trainset}
          testset={optimization.testset}
          status={phase.status}
          hasPreparedAt={!!optimization.preparedAt}
          hasError={phase.hasError}
        />
      </TableCell>
      <TableCell>
        <BaselineCell
          commit={optimization.baselineCommit}
          experiment={optimization.baselineExperiment}
          baselineExperimentUuid={optimization.baselineExperiment?.uuid}
          optimizedExperimentUuid={optimization.optimizedExperiment?.uuid}
          status={phase.status}
          hasValidatedAt={!!optimization.validatedAt}
          hasError={phase.hasError}
        />
      </TableCell>
      <TableCell>
        <OptimizedCell
          commit={optimization.optimizedCommit}
          experiment={optimization.optimizedExperiment}
          baselineExperimentUuid={optimization.baselineExperiment?.uuid}
          optimizedExperimentUuid={optimization.optimizedExperiment?.uuid}
          status={phase.status}
          hasExecutedAt={!!optimization.executedAt}
          hasValidatedAt={!!optimization.validatedAt}
          hasError={phase.hasError}
        />
      </TableCell>
      <TableCell>
        <StartedAtCell
          createdAt={optimization.createdAt}
          hasError={phase.hasError}
        />
      </TableCell>
    </TableRow>
  )
}

function OptimizationsTableBlankSlate({
  setOpenStartModal,
}: {
  setOpenStartModal: (open: boolean) => void
}) {
  return (
    <BlankSlateWithSteps
      title='Welcome to optimizations'
      description='There are no optimizations created yet. Check out how it works before getting started.'
    >
      <BlankSlateStep
        number={1}
        title='Learn how it works'
        description='Watch the video below to see how optimizations can be used to improve the quality of your prompts.'
      >
        <iframe
          className='w-full aspect-video rounded-md'
          src='https://www.youtube.com/embed/trOwCWaIAZk'
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
          allowFullScreen
          title='How to optimize your prompts using LLMs and Latitude.so'
        />
      </BlankSlateStep>
      <BlankSlateStep
        number={2}
        title='Start an optimization'
        description='Our AI can craft an optimization just for this specific prompt, try it out!'
        className='animate-in fade-in duration-300 max-h-[360px] over overflow-y-auto'
      >
        <div className='relative bg-secondary px-4 py-2 rounded-lg border max-h-[272px] overflow-hidden'>
          <div className='max-h-[272px] overflow-hidden'>
            <span className='whitespace-pre-wrap text-sm leading-1 text-muted-foreground'>
              {`
---
  provider: OpenAI
  model: gpt-5.2
---
This is just a placeholder for the optimized prompt because crafting it takes a bit longer than we'd like. Click the button to actually start the optimization, it's free as this one is on us.

Don't rawdog your prompts!
            `.trim()}
            </span>
          </div>
          <div className='absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-secondary to-transparent pointer-events-none' />
          <div className='flex justify-center absolute right-0 bottom-4 w-full'>
            <Button fancy onClick={() => setOpenStartModal(true)}>
              Start an optimization
            </Button>
          </div>
        </div>
      </BlankSlateStep>
    </BlankSlateWithSteps>
  )
}

export function OptimizationsTable({
  optimizations,
  selectedOptimization,
  setSelectedOptimization,
  setOpenStartModal,
  cancelOptimization,
  isCancelingOptimization,
  search,
  setSearch,
  isLoading,
  tableRef,
}: {
  optimizations: OptimizationWithDetails[]
  selectedOptimization?: OptimizationWithDetails
  setSelectedOptimization: (optimization?: OptimizationWithDetails) => void
  setOpenStartModal: (open: boolean) => void
  cancelOptimization: ReturnType<typeof useOptimizations>['cancelOptimization']
  isCancelingOptimization: boolean
  search: Required<Pagination>
  setSearch: (search: Required<Pagination>) => void
  isLoading?: boolean
  tableRef?: RefObject<HTMLTableElement | null>
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const { data: count, isLoading: isCountLoading } = useOptimizationsCount({
    project: project,
    document: document,
  })

  const [optimizationToCancel, setOptimizationToCancel] =
    useState<OptimizationWithDetails>()
  const [openCancelModal, setOpenCancelModal] = useState(false)
  const onCancel = useCallback(
    async (optimization: OptimizationWithDetails) => {
      if (isCancelingOptimization) return
      const [_, errors] = await cancelOptimization({
        optimizationId: optimization.id,
        commitUuid: commit.uuid,
      })
      if (errors) return
      setOpenCancelModal(false)
      setOptimizationToCancel(undefined)
    },
    [isCancelingOptimization, cancelOptimization, commit],
  )

  if (optimizations.length === 0) {
    return (
      <OptimizationsTableBlankSlate setOpenStartModal={setOpenStartModal} />
    )
  }

  return (
    <div className='pb-6'>
      <Table
        ref={tableRef}
        className='table-auto'
        externalFooter={
          <LogicTablePaginationFooter
            page={search.page}
            pageSize={search.pageSize}
            count={count}
            countLabel={(count) => `${count} optimizations`}
            onPageChange={(page) => setSearch({ ...search, page })}
            isLoading={isCountLoading || isLoading}
          />
        }
      >
        <TableHeader className='isolate sticky top-0 z-10'>
          <TableRow>
            <TableHead className='!w-52 !min-w-52 !max-w-52'>Status</TableHead>
            <TableHead>Evaluation</TableHead>
            <TableHead>Datasets</TableHead>
            <TableHead>Baseline</TableHead>
            <TableHead>Optimized</TableHead>
            <TableHead>Started At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {optimizations.map((optimization) => (
            <OptimizationRow
              key={optimization.uuid}
              optimization={optimization}
              isSelected={selectedOptimization?.uuid === optimization.uuid}
              onRowClick={() => {
                setSelectedOptimization(
                  optimization.uuid === selectedOptimization?.uuid
                    ? undefined
                    : optimization,
                )
              }}
              onCancelClick={() => {
                setOptimizationToCancel(optimization)
                setOpenCancelModal(true)
              }}
            />
          ))}
        </TableBody>
      </Table>
      {openCancelModal && optimizationToCancel && (
        <ConfirmModal
          dismissible
          open={openCancelModal}
          title='Cancel optimization'
          type='destructive'
          onOpenChange={(open) => {
            setOpenCancelModal(open)
            if (!open) setOptimizationToCancel(undefined)
          }}
          onConfirm={() => onCancel(optimizationToCancel)}
          onCancel={() => {
            setOpenCancelModal(false)
            setOptimizationToCancel(undefined)
          }}
          confirm={{
            label: isCancelingOptimization ? 'Canceling...' : 'Cancel',
            description:
              'Are you sure you want to cancel this optimization? This action cannot be undone. You can start a new optimization at any time.',
            disabled: isCancelingOptimization,
            isConfirming: isCancelingOptimization,
          }}
          cancel={{
            label: 'Close',
          }}
        />
      )}
    </div>
  )
}
