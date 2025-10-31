import {
  ChangeEvent,
  createContext,
  FormEventHandler,
  KeyboardEvent,
  ReactNode,
  use,
  useCallback,
  useState,
} from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { TextArea as TextAreaAtom } from '@latitude-data/web-ui/atoms/TextArea'
import { font } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultV2,
} from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { OnSubmitProps } from '../useAnnotationForm'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { IssuesSelector } from '../Form/IssuesSelector'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

type IAnnotationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = {
  onSubmit: (_props: OnSubmitProps<T, M>) => void
  isSubmitting: boolean
  disabled: boolean
  commit: Commit
  result: EvaluationResultV2<T, M> | undefined
  setDisabled: ReactStateDispatch<boolean>
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
  result,
}: {
  children: ReactNode
  isSubmitting: boolean
  onSubmit: IAnnotationForm<T, M>['onSubmit']
  commit: Commit
  result: EvaluationResultV2<T, M> | undefined
}) => {
  const [disabled, setDisabled] = useState(true)
  return (
    <AnnotationContext.Provider
      value={{ commit, result, onSubmit, disabled, setDisabled, isSubmitting }}
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
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'bg-background dark:bg-backgroundCode',
        'w-full flex flex-col border border-border rounded-xl',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
      )}
    >
      <IssuesSelector />
      {children}
    </form>
  )
}

AnnotationFormWrapper.displayName = 'AnnotationFormWrapper'

AnnotationFormWrapper.Body = ({ children }: { children: ReactNode }) => {
  return <div className='px-3 pt-3 flex'>{children}</div>
}

AnnotationFormWrapper.Footer = ({ children }: { children: ReactNode }) => {
  return (
    <div className='w-full flex flex-row p-2 items-center justify-between gap-x-4 border-t border-border'>
      {children}
    </div>
  )
}

AnnotationFormWrapper.SubmitButton = function SubmitButton() {
  const { disabled, isSubmitting } = use(AnnotationContext)
  return (
    <Button
      variant='primaryMuted'
      type='submit'
      size='small'
      disabled={isSubmitting || disabled}
    >
      {isSubmitting ? 'Saving...' : 'Save'}
    </Button>
  )
}

AnnotationFormWrapper.SubmitButtonWithTooltip = function SubmitButton({
  tooltip,
}: {
  tooltip?: string | ReactNode
}) {
  if (!tooltip) return <AnnotationFormWrapper.SubmitButton />

  return (
    <div className='flex items-center gap-x-2'>
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
      <AnnotationFormWrapper.SubmitButton />
    </div>
  )
}

AnnotationFormWrapper.TextArea = function TextArea({
  name,
  defaultValue,
  placeholder = 'Explain the reason behind your decision...',
}: {
  name: string
  defaultValue?: string | null
  placeholder?: string
}) {
  const { setDisabled } = use(AnnotationContext)
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      const form = event.currentTarget.closest('form')
      if (form) {
        form.requestSubmit()
      }
    }
  }
  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value

      const hasChanged = value !== (defaultValue ?? '')
      setDisabled(!hasChanged)
    },
    [defaultValue, setDisabled],
  )

  return (
    <TextAreaAtom
      name={name}
      variant='unstyled'
      size='none'
      onChange={onChange}
      className={cn(
        'bg-background dark:bg-backgroundCode',
        'w-full focus:ring-0 focus-visible:ring-0 focus-visible:outline-none',
        'appearance-none text-foreground placeholder:text-muted-foreground/50',
        font.size.h5,
      )}
      defaultValue={defaultValue ?? ''}
      placeholder={placeholder}
      minRows={2}
      onKeyDown={handleKeyDown}
    />
  )
}
