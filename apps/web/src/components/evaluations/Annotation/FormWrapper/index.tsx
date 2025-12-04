import {
  ChangeEvent,
  createContext,
  FormEventHandler,
  ReactNode,
  use,
  useCallback,
  useState,
} from 'react'
import Link from 'next/link'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea as TextAreaAtom } from '@latitude-data/web-ui/atoms/TextArea'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { font } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationV2,
  SpanWithDetails,
  SpanType,
} from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { OnSubmitProps } from '../useAnnotationForm'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { AnnotationsProgressIcon } from '$/components/AnnotationProgressPanel/AnntationsProgressIcon'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ROUTES } from '$/services/routes'

type IAnnotationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = {
  onSubmit: (_props: OnSubmitProps<T, M>) => void
  isSubmitting: boolean
  disabled: boolean
  documentUuid: string
  commit: Commit
  result: EvaluationResultV2<T, M> | undefined
  evaluation: EvaluationV2<T, M>
  span: SpanWithDetails<SpanType.Prompt>
  setDisabled: ReactStateDispatch<boolean>
  isExpanded: boolean
  setIsExpanded: ReactStateDispatch<boolean>
  mergedToIssueId?: number
  localReason: string
  setLocalReason: ReactStateDispatch<string>
  localScore: number | undefined
  setLocalScore: ReactStateDispatch<number | undefined>
  hasChanges: boolean
}

export function createAnnotationContext<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>() {
  return createContext<IAnnotationForm<T, M>>({} as IAnnotationForm<T, M>)
}

export const AnnotationContext = createAnnotationContext<
  EvaluationType,
  EvaluationMetric<EvaluationType>
>()

export const AnnotationProvider = <
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  children,
  isSubmitting,
  onSubmit,
  commit,
  documentUuid,
  span,
  evaluation,
  result,
  isExpanded,
  setIsExpanded,
  mergedToIssueId,
}: {
  children: ReactNode
  isSubmitting: boolean
  onSubmit: IAnnotationForm<T, M>['onSubmit']
  commit: Commit
  span: SpanWithDetails<SpanType.Prompt>
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M> | undefined
  documentUuid: string
  isExpanded: boolean
  setIsExpanded: ReactStateDispatch<boolean>
  mergedToIssueId?: number
}) => {
  const [disabled, setDisabled] = useState(false)

  // Local state for score and reason (lifted from individual components)
  const [localScore, setLocalScore] = useState<number | undefined>(
    result?.score ?? undefined,
  )
  const [localReason, setLocalReason] = useState<string>(() => {
    if (!result?.metadata) return ''
    if (!('reason' in result.metadata)) return ''
    return result.metadata.reason || ''
  })

  // Check if there are unsaved changes
  const hasChanges =
    localScore !== result?.score ||
    localReason !==
      (result?.metadata && 'reason' in result.metadata
        ? result.metadata.reason || ''
        : '')

  return (
    <AnnotationContext.Provider
      value={{
        commit,
        documentUuid,
        evaluation,
        result,
        onSubmit,
        span,
        disabled,
        setDisabled,
        isSubmitting,
        isExpanded,
        setIsExpanded,
        mergedToIssueId,
        localReason,
        setLocalReason,
        localScore,
        setLocalScore,
        hasChanges,
      }}
    >
      {children}
    </AnnotationContext.Provider>
  )
}

export const AnnotationFormWrapper = ({
  children,
  onSubmit,
}: {
  children: ReactNode
  onSubmit: FormEventHandler<HTMLFormElement>
}) => {
  return <form onSubmit={onSubmit}>{children}</form>
}

AnnotationFormWrapper.displayName = 'AnnotationFormWrapper'

AnnotationFormWrapper.Body = ({ children }: { children: ReactNode }) => {
  return <div className='px-3 pt-3 flex'>{children}</div>
}

AnnotationFormWrapper.Footer = function Footer({
  children,
}: {
  children: ReactNode
}) {
  const { isExpanded } = use(AnnotationContext)
  return (
    <div
      className={cn(
        'w-full flex flex-row items-center justify-between gap-x-4 ',
        {
          'p-2 border-t border-border': isExpanded,
        },
      )}
    >
      {children}
    </div>
  )
}

AnnotationFormWrapper.SaveButton = function SaveButton({
  onClick,
}: {
  onClick: () => void
}) {
  const { isSubmitting, hasChanges } = use(AnnotationContext)

  if (!hasChanges) return null

  return (
    <Button
      type='button'
      size='small'
      variant='default'
      {...(isSubmitting ? { iconProps: { name: 'loader', spin: true } } : {})}
      onClick={onClick}
      disabled={isSubmitting}
    >
      {isSubmitting ? 'Saving...' : 'Save annotation'}
    </Button>
  )
}

AnnotationFormWrapper.AnnotationTooltipInfo = function AnnotationTooltipInfo({
  tooltip,
}: {
  tooltip?: string | ReactNode
}) {
  if (!tooltip) return null

  return (
    <Tooltip
      asChild
      align='center'
      side='bottom'
      trigger={
        <div className='flex gap-x-3 items-center'>
          <Icon name='info' color='foregroundMuted' />
        </div>
      }
    >
      {tooltip}
    </Tooltip>
  )
}

AnnotationFormWrapper.TextArea = function TextArea({
  name,
  value,
  onChange,
  placeholder = 'Write your feedback here...',
  disabled = false,
}: {
  name: string
  value: string | null
  onChange: (value: string) => void
  defaultValue?: string | null
  placeholder?: string
  disabled?: boolean
}) {
  const onChangeValue = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value
      onChange(value)
    },
    [onChange],
  )

  return (
    <TextAreaAtom
      name={name}
      variant='unstyled'
      size='none'
      value={value ?? ''}
      onChange={onChangeValue}
      disabled={disabled}
      className={cn(
        'bg-background dark:bg-backgroundCode',
        'w-full focus:ring-0 focus-visible:ring-0 focus-visible:outline-none',
        'appearance-none text-foreground placeholder:text-muted-foreground/50',
        font.size.h5,
      )}
      placeholder={placeholder}
      minRows={2}
    />
  )
}

AnnotationFormWrapper.FailedWithoutReasonWarning =
  function FailedWithoutReasonWarning() {
    const { project } = useCurrentProject()
    const { commit } = useCurrentCommit()
    const issuesDashboardLink = ROUTES.projects
      .detail({ id: project.id })
      .commits.detail({ uuid: commit.uuid }).issues.root

    return (
      <div className='rounded-lg mx-3 my-2 p-1.5 border border-dashed bg-secondary'>
        <div className='px-3 py-2 bg-background rounded-md flex items-center gap-x-2'>
          <AnnotationsProgressIcon isCompleted />
          <Text.H6 color='foregroundMuted'>
            Please write what went wrong with this AI interaction. Your
            feedback helps Latitude identify patterns and create actionable
            issues, making it easier to improve your prompts over time. Check
            the{' '}
            <Link href={issuesDashboardLink} target='_blank'>
              <Text.H6M underline color='foregroundMuted'>
                issues section
              </Text.H6M>
            </Link>
          </Text.H6>
        </div>
      </div>
    )
  }
