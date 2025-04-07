import { ChangeEvent, FormEvent } from 'react'
import Link from 'next/link'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { cn } from '@latitude-data/web-ui/utils'
import { FormField } from '@latitude-data/web-ui/atoms/FormField'
import { FormWrapper } from '@latitude-data/web-ui/atoms/FormWrapper'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { TableSkeleton } from '@latitude-data/web-ui/molecules/TableSkeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import { PreviewTable } from '$/components/PreviewTable'
import type { PreviewData } from '../useDatasetPreviewModal'

export function GenerateDatasetModalComponent({
  open,
  onOpenChange,
  previewIsLoading,
  generateIsLoading,
  previewData,
  defaultParameters,
  parameters,
  backUrl,
  defaultName,
  onSubmit,
  handleRegeneratePreview,
  handleParametersChange,
  errorMessage,
  explanation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  previewIsLoading: boolean
  generateIsLoading: boolean
  defaultName?: string
  defaultParameters: string[]
  parameters: string[]
  backUrl?: string
  previewData: PreviewData
  explanation?: string
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  handleRegeneratePreview: () => Promise<void>
  handleParametersChange: (e: ChangeEvent<HTMLInputElement>) => void
  errorMessage: string | undefined
}) {
  const previewDone = previewData && explanation
  return (
    <Modal
      dismissible
      open={open}
      size='large'
      onOpenChange={onOpenChange}
      title='Generate new dataset'
      description='Generate a dataset of parameters using AI. Datasets can be used to run batch evaluations over prompts.'
      footer={
        <div className='flex flex-col gap-y-4 w-full'>
          <div
            className={cn('w-full flex flex-row flex-grow gap-4', {
              'justify-between': !!backUrl,
              'justify-end': !backUrl,
            })}
          >
            {backUrl && (
              <Link href={backUrl}>
                <Button variant='link'>
                  <Icon name='arrowLeft' /> Go back
                </Button>
              </Link>
            )}
            <div className='flex flex-row gap-2'>
              <CloseTrigger />
              {previewData && (
                <Button
                  onClick={handleRegeneratePreview}
                  disabled={previewIsLoading || generateIsLoading}
                  fancy
                  variant='outline'
                >
                  Regenerate preview
                </Button>
              )}
              <Button
                disabled={previewIsLoading || generateIsLoading}
                fancy
                form='generateDatasetForm'
                type='submit'
              >
                {previewIsLoading || generateIsLoading
                  ? 'Generating...'
                  : previewData
                    ? 'Generate dataset'
                    : 'Generate preview'}
              </Button>
            </div>
          </div>
          <div className='justify-end flex-grow'>
            {generateIsLoading && <LoadingText />}
          </div>
        </div>
      }
    >
      <div className='flex flex-col gap-6'>
        <form className='min-w-0' id='generateDatasetForm' onSubmit={onSubmit}>
          <FormWrapper>
            <FormField label='Name'>
              <Input
                required
                type='text'
                name='name'
                placeholder='Dataset name'
                defaultValue={defaultName}
              />
            </FormField>
            <FormField
              label='Parameters'
              info='When you evaluate a prompt, you will map these dataset parameters to your prompt parameters'
            >
              <div className='flex flex-col gap-2'>
                <Input
                  required
                  type='text'
                  name='parameters'
                  placeholder='Enter comma-separated parameters (e.g., name, age, city)'
                  onChange={handleParametersChange}
                  defaultValue={defaultParameters.join(', ')}
                />
                {parameters.length > 0 && (
                  <div className='flex flex-col gap-2'>
                    <Text.H6 color='foregroundMuted'>
                      The AI agent will generate a dataset with these
                      parameters:
                    </Text.H6>
                    <div className='flex flex-wrap gap-2'>
                      {parameters.map((param, index) => (
                        <Badge key={index} variant='secondary'>
                          {param}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </FormField>
            <FormField
              label='Additional instructions'
              info='Provide additional context about each parameter to the LLM agent to help it generate the dataset'
            >
              <TextArea
                name='description'
                placeholder='Provide additional context to the LLM agent to help it generate the dataset'
                minRows={3}
                maxRows={5}
              />
            </FormField>
            {previewData ? (
              <FormField
                label='Row count'
                info='AI agent might decide to generate more or less rows than requested'
              >
                <div className='max-w-[200px]'>
                  <Input
                    defaultValue={100}
                    max={200}
                    min={0}
                    name='rows'
                    placeholder='Number of rows to generate'
                    type='number'
                  />
                </div>
              </FormField>
            ) : null}
          </FormWrapper>
        </form>
        {errorMessage && (
          <Alert
            title='Error'
            description={errorMessage}
            variant='destructive'
          />
        )}
        {previewIsLoading && !previewDone && (
          <div className='animate-in fade-in slide-in-from-top-5 duration-300 overflow-y-hidden'>
            <TableSkeleton rows={10} cols={parameters} maxHeight={320} />
          </div>
        )}
        {previewDone && previewData.rows.length > 0 && (
          <div className='animate-in fade-in duration-300 flex flex-col gap-2'>
            <PreviewTable
              rows={previewData.rows}
              headers={previewData.headers}
            />
            <div className='flex items-start gap-2'>
              <Tooltip trigger={<Icon name='info' color='foregroundMuted' />}>
                {explanation}
              </Tooltip>
              <Text.H6 color='foregroundMuted'>
                This is a preview of the dataset. You can generate the complete
                dataset by clicking the button below.
              </Text.H6>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
