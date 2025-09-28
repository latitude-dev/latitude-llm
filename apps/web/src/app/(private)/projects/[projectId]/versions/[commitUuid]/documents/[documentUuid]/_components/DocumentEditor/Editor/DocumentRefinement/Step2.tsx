import ResultBadge from '$/components/evaluations/ResultBadge'
import { LimitedTablePaginationFooter } from '$/components/TablePaginationFooter/LimitedTablePaginationFooter'
import { useSelectableRows } from '$/hooks/useSelectableRows'
import { relativeTime } from '$/lib/relativeTime'
import { ROUTES } from '$/services/routes'
import { useCommits } from '$/stores/commitsStore'
import {
  useEvaluationResultsV2,
  useEvaluationResultsV2Count,
} from '$/stores/evaluationResultsV2'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Checkbox } from '@latitude-data/web-ui/atoms/Checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TableBlankSlate } from '@latitude-data/web-ui/molecules/TableBlankSlate'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import {
  ICommitContextType,
  IProjectContextType,
} from '@latitude-data/web-ui/providers'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DocumentVersion } from '@latitude-data/core/schema/types'

const PAGE_SIZE = 7

export function Step2({
  project,
  commit,
  document,
  evaluationUuid,
  selectedResultUuids,
  setSelectedResultUuids,
}: {
  project: IProjectContextType['project']
  commit: ICommitContextType['commit']
  document: DocumentVersion
  evaluationUuid: string
  selectedResultUuids: string[]
  setSelectedResultUuids: (uuids: string[]) => void
}) {
  const { data: commits, isLoading: isCommitsLoading } = useCommits()

  const { data: evaluations, isLoading: isEvaluationsLoading } =
    useEvaluationsV2({ project, commit, document })
  const evaluation = useMemo(
    () => evaluations.find((e) => e.uuid === evaluationUuid),
    [evaluations, evaluationUuid],
  )

  const [page, setPage] = useState(1)
  const search = useMemo(
    () => ({
      filters: {
        commitIds: commits
          .filter((c) => !!c.mergedAt || c.uuid == commit.uuid)
          .map((c) => c.id),
        errored: false,
      },
      pagination: { page, pageSize: PAGE_SIZE },
    }),
    [commits, commit, page],
  )

  const { data: results, isLoading: isResultsLoading } = useEvaluationResultsV2(
    {
      project: project,
      commit: commit,
      document: document,
      evaluation: { uuid: evaluationUuid },
      search: search,
    },
  )

  const { data: nextResults } = useEvaluationResultsV2({
    project: project,
    commit: commit,
    document: document,
    evaluation: { uuid: evaluationUuid },
    search: {
      ...search,
      pagination: { ...search.pagination, page: page + 1 },
    },
  })

  const { data: count, isLoading: isCountLoading } =
    useEvaluationResultsV2Count({
      project: project,
      commit: commit,
      document: document,
      evaluation: { uuid: evaluationUuid },
      search: search,
    })

  const selectableResultIds = useMemo(
    () => results.filter((r) => !r.error).map((r) => r.uuid),
    [results],
  )
  const selectableState = useSelectableRows({
    rowIds: selectableResultIds,
    initialSelection: selectedResultUuids,
    totalRowCount: count,
  })

  useEffect(() => {
    setSelectedResultUuids(selectableState.selectedRowIds.map(String))
  }, [selectableState.selectedRowIds, setSelectedResultUuids])

  const isLoading =
    isEvaluationsLoading ||
    isResultsLoading ||
    isCommitsLoading ||
    isCountLoading

  if (isLoading) {
    return (
      <TableSkeleton
        rows={PAGE_SIZE}
        cols={['', 'Time', 'Version', 'Result']}
      />
    )
  }

  if (!results.length) {
    return (
      <TableBlankSlate
        description='There are no logs evaluated in this version yet. You need to evaluate some logs to refine the prompt.'
        link={
          <Link
            href={
              ROUTES.projects
                .detail({ id: project.id })
                .commits.detail({ uuid: commit.uuid })
                .documents.detail({ uuid: document.documentUuid }).logs.root
            }
          >
            <Button>Evaluate logs</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div className='flex flex-col gap-y-4'>
      <Table
        className='table-auto'
        externalFooter={
          <LimitedTablePaginationFooter
            page={page}
            nextPage={nextResults.length > 0}
            onPageChange={setPage}
          />
        }
      >
        <TableHeader className='sticky top-0 z-10'>
          <TableRow>
            <TableHead align='left' onClick={selectableState.toggleAll}>
              <Checkbox
                fullWidth={false}
                checked={selectableState.headerState}
              />
            </TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className='max-h-full overflow-y-auto'>
          {results.map((result) => (
            <TableRow
              key={result.uuid}
              onClick={() =>
                selectableState.toggleRow(
                  result.uuid,
                  !selectableState.isSelected(result.uuid),
                )
              }
              className={cn(
                'cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors',
                {
                  'bg-secondary hover:bg-secondary/50':
                    selectableState.isSelected(result.uuid),
                },
              )}
            >
              <TableCell align='left'>
                <Checkbox
                  fullWidth={false}
                  checked={selectableState.isSelected(result.uuid)}
                />
              </TableCell>
              <TableCell>
                <Text.H5 noWrap>
                  <time dateTime={new Date(result.createdAt).toISOString()}>
                    {relativeTime(new Date(result.createdAt))}
                  </time>
                </Text.H5>
              </TableCell>
              <TableCell>
                <span className='flex flex-row gap-2 items-center overflow-hidden'>
                  <Badge variant={result.commit.version ? 'accent' : 'muted'}>
                    <Text.H6 noWrap>
                      {result.commit.version
                        ? `v${result.commit.version}`
                        : 'Draft'}
                    </Text.H6>
                  </Badge>
                  <Text.H5 noWrap ellipsis>
                    {result.commit.title}
                  </Text.H5>
                </span>
              </TableCell>
              <TableCell>
                <ResultBadge evaluation={evaluation!} result={result} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
