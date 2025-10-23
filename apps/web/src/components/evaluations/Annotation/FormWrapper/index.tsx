import {
  ChangeEvent,
  createContext,
  FormEventHandler,
  ReactNode,
  use,
  useCallback,
  useState,
} from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea as TextAreaAtom } from '@latitude-data/web-ui/atoms/TextArea'
import { font } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultV2,
  DocumentLog,
  EvaluationV2,
} from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { OnSubmitProps } from '../useAnnotationForm'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

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
  documentLog: DocumentLog
  setDisabled: ReactStateDispatch<boolean>
  isExpanded: boolean
  setIsExpanded: ReactStateDispatch<boolean>
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
  documentLog,
  evaluation,
  result,
  isExpanded,
  setIsExpanded,
}: {
  children: ReactNode
  isSubmitting: boolean
  onSubmit: IAnnotationForm<T, M>['onSubmit']
  commit: Commit
  documentLog: DocumentLog
  evaluation: EvaluationV2<T, M>
  result: EvaluationResultV2<T, M> | undefined
  documentUuid: string
  isExpanded: boolean
  setIsExpanded: ReactStateDispatch<boolean>
}) => {
  const [disabled, setDisabled] = useState(false)
  return (
    <AnnotationContext.Provider
      value={{
        commit,
        documentUuid,
        evaluation,
        result,
        onSubmit,
        documentLog,
        disabled,
        setDisabled,
        isSubmitting,
        isExpanded,
        setIsExpanded,
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

AnnotationFormWrapper.SavingSpinner = function SavingSpinner() {
  const { isSubmitting } = use(AnnotationContext)
  if (!isSubmitting) return null

  return (
    <div className='flex items-center gap-x-2'>
      <Text.H6 color='foregroundMuted'>Saving...</Text.H6>
      <Icon name='loader' spin color='foregroundMuted' />
    </div>
  )
}

AnnotationFormWrapper.AnnotationTooltipInfo = function AnnotationTooltipInfo({
  tooltip,
}: {
  tooltip?: string | ReactNode
}) {
  if (!tooltip) return <AnnotationFormWrapper.SavingSpinner />

  return (
    <div className='flex items-center gap-x-2'>
      <AnnotationFormWrapper.SavingSpinner />
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
    </div>
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
