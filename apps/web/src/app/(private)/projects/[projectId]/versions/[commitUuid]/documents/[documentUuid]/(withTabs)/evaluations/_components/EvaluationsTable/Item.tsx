import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import {
  EVALUATION_TRIGGER_MODE_INFO,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import {
  EvaluationType,
  EvaluationV2,
  EvaluationTriggerMode,
} from '@latitude-data/core/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import {
  DropdownMenu,
  MenuOption,
} from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TableCell, TableRow } from '@latitude-data/web-ui/atoms/Table'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { MouseEvent, useMemo } from 'react'

export function EvaluationTableItem({
  evaluation,
  annotationsEvaluation,
  onUseAnnotations,
  onUnuseAnnotations,
  onToggleLiveEvaluation,
  setSelectedEvaluation,
  setOpenDeleteModal,
  isUpdatingEvaluation,
  isDeletingEvaluation,
}: {
  evaluation: EvaluationV2
  annotationsEvaluation: EvaluationV2<EvaluationType.Human> | undefined
  onUseAnnotations: (evaluation: EvaluationV2<EvaluationType.Human>) => void
  onUnuseAnnotations: (evaluation: EvaluationV2<EvaluationType.Human>) => void
  onToggleLiveEvaluation: (evaluation: EvaluationV2) => void
  setSelectedEvaluation: (evaluation: EvaluationV2) => void
  setOpenDeleteModal: (open: boolean) => void
  isUpdatingEvaluation: boolean
  isDeletingEvaluation: boolean
}) {
  const navigate = useNavigate()

  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

  const specification = getEvaluationMetricSpecification(evaluation)

  const options = useMemo<MenuOption[]>(
    () => [
      ...(evaluation.type === EvaluationType.Human
        ? [
            evaluation.uuid === annotationsEvaluation?.uuid
              ? {
                  label: 'Unuse for annotations',
                  onElementClick: (e: MouseEvent) => e.stopPropagation(),
                  onClick: () =>
                    onUnuseAnnotations(
                      evaluation as EvaluationV2<EvaluationType.Human>,
                    ),
                  disabled: isUpdatingEvaluation,
                }
              : {
                  label: 'Use for annotations',
                  onElementClick: (e: MouseEvent) => e.stopPropagation(),
                  onClick: () =>
                    onUseAnnotations(
                      evaluation as EvaluationV2<EvaluationType.Human>,
                    ),
                  disabled: isUpdatingEvaluation,
                },
          ]
        : []),

      ...(specification.supportsLiveEvaluation
        ? [
            {
              label:
                evaluation.configuration.trigger?.mode !==
                EvaluationTriggerMode.Disabled
                  ? 'Disable live evaluation'
                  : 'Enable live evaluation',
              onElementClick: (e: MouseEvent) => e.stopPropagation(),
              onClick: () => onToggleLiveEvaluation(evaluation),
              disabled: isUpdatingEvaluation,
            },
          ]
        : []),

      ...(evaluation.uuid !== document.mainEvaluationUuid
        ? [
            {
              label: 'Remove',
              onElementClick: (e: MouseEvent) => e.stopPropagation(),
              onClick: () => {
                setSelectedEvaluation(evaluation)
                setOpenDeleteModal(true)
              },
              disabled: isDeletingEvaluation,
              type: 'destructive' as const,
            },
          ]
        : []),
    ],
    [
      evaluation,
      annotationsEvaluation,
      specification,
      isUpdatingEvaluation,
      isDeletingEvaluation,
      onUseAnnotations,
      onUnuseAnnotations,
      onToggleLiveEvaluation,
      setSelectedEvaluation,
      setOpenDeleteModal,
      document.mainEvaluationUuid,
    ],
  )

  return (
    <TableRow
      key={evaluation.uuid}
      className='cursor-pointer border-b-[0.5px] h-12 max-h-12 border-border transition-colors'
      onClick={() =>
        navigate.push(
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({
              uuid: document.documentUuid,
            })
            .evaluations.detail({ uuid: evaluation.uuid }).root,
        )
      }
    >
      <TableCell>
        <div className='flex items-center justify-between gap-2 truncate'>
          <Text.H5 noWrap ellipsis>
            {evaluation.name}
          </Text.H5>
          {evaluation.configuration.trigger?.mode &&
            evaluation.configuration.trigger.mode !==
              EvaluationTriggerMode.Disabled && (
              <Tooltip
                asChild
                trigger={
                  <Badge variant='accent'>
                    <div className='flex items-center gap-1'>
                      {
                        EVALUATION_TRIGGER_MODE_INFO[
                          evaluation.configuration.trigger.mode
                        ].label
                      }
                      <Icon
                        name={
                          EVALUATION_TRIGGER_MODE_INFO[
                            evaluation.configuration.trigger.mode
                          ].icon ?? 'radio'
                        }
                        size='small'
                      />
                    </div>
                  </Badge>
                }
                align='center'
                side='top'
                maxWidth='max-w-[400px]'
              >
                {
                  EVALUATION_TRIGGER_MODE_INFO[
                    evaluation.configuration.trigger.mode
                  ].description
                }
              </Tooltip>
            )}
          {evaluation.uuid === annotationsEvaluation?.uuid && (
            <Tooltip
              trigger={<Icon name='thumbsUp' color='primary' />}
              align='center'
              side='top'
              maxWidth='max-w-[400px]'
            >
              This evaluation is used for human annotations
            </Tooltip>
          )}
          {evaluation.uuid === document.mainEvaluationUuid && (
            <Tooltip
              trigger={<Icon name='shieldAlert' color='primary' />}
              align='center'
              side='top'
              maxWidth='max-w-[400px]'
            >
              This evaluation is automatically managed by the system and
              contains a combination of all evaluations that are tracking and
              monitoring active issues.
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Text.H5>{evaluation.description || '-'}</Text.H5>
      </TableCell>
      <TableCell>
        <Text.H5>
          <span className='flex items-center gap-2'>
            <Icon
              name={specification.icon}
              color='foreground'
              size='normal'
              className='shrink-0'
            />
            <Text.H5 noWrap ellipsis>
              {specification.name}
            </Text.H5>
          </span>
        </Text.H5>
      </TableCell>
      <TableCell>
        {options.length > 0 && (
          <DropdownMenu
            options={options}
            side='bottom'
            align='end'
            triggerButtonProps={{
              className: 'border-none justify-end cursor-pointer',
            }}
          />
        )}
      </TableCell>
    </TableRow>
  )
}
