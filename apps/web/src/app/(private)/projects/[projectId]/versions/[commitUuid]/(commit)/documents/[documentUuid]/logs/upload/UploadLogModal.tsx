'use client'

import { LATITUDE_DOCS_URL } from '@latitude-data/core/browser'
import {
  Alert,
  Button,
  CloseTrigger,
  DropzoneInput,
  FormWrapper,
  Modal,
  Text,
  useToast,
} from '@latitude-data/web-ui'
import { uploadDocumentLogsAction } from '$/actions/documentLogs/upload'
import DelimiterSelector from '$/app/(private)/datasets/new/_components/DelimiterSelector'
import { useFormAction } from '$/hooks/useFormAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

interface UploadLogModalProps {
  documentUuid: string
  commitUuid: string
  projectId: string
}

export default function UploadLogModal({
  documentUuid,
  commitUuid,
  projectId,
}: UploadLogModalProps) {
  const { toast } = useToast()
  const returnRoute = ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid }).logs.root
  const navigate = useNavigate()
  const { execute, isPending } = useLatitudeAction(uploadDocumentLogsAction, {
    onSuccess: () => {
      toast({
        title: 'Logs uploaded successfully',
        description:
          'Logs will be processed and will shortly appear in the logs table',
      })

      navigate.push(returnRoute)
    },
  })
  const { action, error } = useFormAction(execute)
  const errors = error?.fieldErrors as Record<string, string[]>

  return (
    <Modal
      open
      onOpenChange={(open) => !open && navigate.push(returnRoute)}
      title='Upload external logs'
      description="If you run prompts outside of Latitude, you can upload your logs in order to evaluate your prompt's performance."
      footer={
        <>
          <CloseTrigger />
          <Button
            disabled={isPending}
            fancy
            form='uploadLogsForm'
            type='submit'
          >
            Upload logs
          </Button>
        </>
      }
    >
      <form className='min-w-0' id='uploadLogsForm' action={action}>
        <FormWrapper>
          <input type='hidden' name='documentUuid' value={documentUuid} />
          <input type='hidden' name='commitUuid' value={commitUuid} />
          <input type='hidden' name='projectId' value={projectId} />
          <DelimiterSelector
            delimiterDefaultValue='comma'
            delimiterErrors={errors?.csvDelimiter}
            delimiterInputName='csvDelimiter'
            customDelimiterInputName='csvCustomDelimiter'
          />
          <div>
            <DropzoneInput
              multiple={false}
              accept='.csv'
              label='Upload logs csv'
              name='logsFile'
              placeholder='Upload logs csv'
              errors={errors?.logsFile}
            />
            <div>
              <Text.H6 color='foregroundMuted'>
                Upload a csv file with your prompt logs.{' '}
                <a
                  target='_blank'
                  className='text-accent-foreground underline'
                  href={`${LATITUDE_DOCS_URL}/guides/logs/upload-logs`}
                >
                  Learn more
                </a>
              </Text.H6>
            </div>
          </div>
        </FormWrapper>
      </form>
      <article>
        <Alert
          description='The file should be a single-column CSV where each row is a log in JSON format.'
          cta={
            <span>
              <a
                target='_blank'
                className='text-sm whitespace-nowrap text-accent-foreground underline'
                href='https://docs.google.com/spreadsheets/d/1uxmUW2XhcqRB_cK0SBmHzUfa9xMqVzKZ0eT8umO8pr8/edit?usp=sharing'
              >
                Example csv
              </a>
            </span>
          }
        />
      </article>
    </Modal>
  )
}
