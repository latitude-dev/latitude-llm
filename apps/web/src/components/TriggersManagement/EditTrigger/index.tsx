import { cn } from '@latitude-data/web-ui/utils'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocumentTriggerType } from '@latitude-data/constants'
import { SelectDocument } from '../components/SelectDocument'
import { EditTriggerProps } from '../types'
import { EditEmailTrigger } from './EmailTrigger'
import { EditIntegrationTrigger } from './IntegrationTrigger'
import { EditScheduleTrigger } from './ScheduleTrigger'
import { type UseUpdateDocumentTrigger } from './useUpdateDocumentTrigger'

function LoadingTrigger() {
  return (
    <div className='flex items-center justify-center min-h-36'>
      <Text.H5>Loading...</Text.H5>
    </div>
  )
}

function EditTriggerByType<T extends DocumentTriggerType>(
  props: EditTriggerProps<T>,
) {
  const type = props.trigger.triggerType

  if (type === DocumentTriggerType.Email) {
    return (
      <EditEmailTrigger
        {...(props as EditTriggerProps<DocumentTriggerType.Email>)}
      />
    )
  }

  if (type === DocumentTriggerType.Integration) {
    return (
      <EditIntegrationTrigger
        {...(props as EditTriggerProps<DocumentTriggerType.Integration>)}
      />
    )
  }

  if (type === DocumentTriggerType.Scheduled) {
    return (
      <EditScheduleTrigger
        {...(props as EditTriggerProps<DocumentTriggerType.Scheduled>)}
      />
    )
  }

  return <Text.H5>Unsupported trigger type: {type}</Text.H5>
}

export function EditTriggerModalFooter({
  isMerged,
  withDeleteButton,
  isDeleting,
  isUpdating,
  onDeleteTrigger,
  onUpdate,
}: {
  isMerged: UseUpdateDocumentTrigger['isMerged']
  isDeleting: UseUpdateDocumentTrigger['isDeleting']
  isUpdating: UseUpdateDocumentTrigger['isUpdating']
  onDeleteTrigger: UseUpdateDocumentTrigger['onDeleteTrigger']
  onUpdate: UseUpdateDocumentTrigger['onUpdate']
  withDeleteButton?: boolean
}) {
  if (isMerged) return null

  return (
    <>
      {withDeleteButton && (
        <Button
          fancy
          disabled={isDeleting}
          variant='outlineDestructive'
          onClick={onDeleteTrigger}
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </Button>
      )}
      <Button disabled={isUpdating} fancy onClick={onUpdate}>
        Update
      </Button>
    </>
  )
}

type Props = {
  isLoading: UseUpdateDocumentTrigger['isLoading']
  trigger: UseUpdateDocumentTrigger['trigger']
  document: UseUpdateDocumentTrigger['document']
  isMerged: UseUpdateDocumentTrigger['isMerged']
  docSelection: UseUpdateDocumentTrigger['docSelection']
  setTriggerConfiguration: UseUpdateDocumentTrigger['setTriggerConfiguration']
  isUpdating: UseUpdateDocumentTrigger['isUpdating']
  canChangeDocument?: boolean
}
export function EditTriggerModalContent({
  isLoading,
  trigger,
  document,
  isMerged,
  docSelection,
  setTriggerConfiguration,
  isUpdating,
  canChangeDocument = true,
}: Props) {
  return (
    <>
      {isLoading ? <LoadingTrigger /> : null}
      {trigger && document ? (
        <div className='space-y-4'>
          {isMerged ? (
            <Alert
              title='Live versions'
              description='You need to do a new version to edit this trigger'
              variant='warning'
            />
          ) : null}
          <div className={cn({ 'pointer-events-none opacity-60': isMerged })}>
            <FormWrapper>
              <SelectDocument
                onSelectDocument={docSelection.onSelectDocument}
                options={docSelection.options}
                document={docSelection.document}
                disabled={!canChangeDocument}
              />
              <EditTriggerByType
                trigger={trigger}
                document={docSelection.document ?? document}
                setConfiguration={setTriggerConfiguration}
                isUpdating={isUpdating}
              />
            </FormWrapper>
          </div>
        </div>
      ) : null}
    </>
  )
}
