import {
  ACCESSIBLE_OUTPUT_FORMATS,
  baseEvaluationConfiguration,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
} from '@latitude-data/core/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { ActualOutputTest } from '../ActualOutputTest'

const MESSAGE_SELECTION_OPTIONS =
  baseEvaluationConfiguration.shape.actualOutput.shape.messageSelection.options.map(
    (option) => ({
      label: option.toUpperCase().split('_').join(' '),
      value: option,
    }),
  )

const CONTENT_FILTER_OPTIONS =
  baseEvaluationConfiguration.shape.actualOutput.shape.contentFilter
    .unwrap()
    .options.map((option) => ({
      label: option.toUpperCase().split('_').join(' '),
      value: option,
    }))

const PARSING_FORMAT_OPTIONS =
  baseEvaluationConfiguration.shape.actualOutput.shape.parsingFormat.options.map(
    (option) => ({
      label: option.toUpperCase().split('_').join(' '),
      value: option,
    }),
  )

export function OutputConfiguration<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  configuration,
  setConfiguration,
  requiresExpectedOutput,
  errors,
  disabled,
}: {
  configuration: EvaluationConfiguration<T, M>
  setConfiguration: (configuration: EvaluationConfiguration<T, M>) => void
  requiresExpectedOutput: boolean
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const actualFormatIsAccessible = useMemo(
    () =>
      !!configuration.actualOutput?.parsingFormat &&
      ACCESSIBLE_OUTPUT_FORMATS.includes(
        configuration.actualOutput.parsingFormat,
      ),
    [configuration.actualOutput?.parsingFormat],
  )
  const expectedFormatIsAccessible = useMemo(
    () =>
      !!configuration.expectedOutput?.parsingFormat &&
      ACCESSIBLE_OUTPUT_FORMATS.includes(
        configuration.expectedOutput.parsingFormat,
      ),
    [configuration.expectedOutput?.parsingFormat],
  )

  useEffect(() => {
    let actualOutput = configuration.actualOutput
    if (actualOutput && !actualFormatIsAccessible) {
      actualOutput = { ...actualOutput, fieldAccessor: undefined }
    }

    let expectedOutput = configuration.expectedOutput
    if (expectedOutput && !expectedFormatIsAccessible) {
      expectedOutput = { ...expectedOutput, fieldAccessor: undefined }
    }

    setConfiguration({ ...configuration, actualOutput, expectedOutput })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualFormatIsAccessible, expectedFormatIsAccessible])

  const [testConfiguration] = useDebounce(configuration.actualOutput, 750)
  const [showTest, setShowTest] = useState(false)

  return (
    <>
      <FormFieldGroup
        label={
          <span className='w-full flex justify-between items-center gap-2'>
            Actual output
            <Button
              variant='link'
              size='none'
              iconProps={{
                name: showTest ? 'close' : 'arrowDown',
                widthClass: 'w-4',
                heightClass: 'h-4',
                placement: 'right',
              }}
              onClick={(event) => {
                event.preventDefault()
                setShowTest(!showTest && !!configuration.actualOutput)
              }}
            >
              {showTest ? 'Close' : 'Test'}
            </Button>
          </span>
        }
        description='How to extract the output, to evaluate against, from the conversation'
        descriptionPosition='top'
        layout='vertical'
        group
      >
        <FormFieldGroup
          label='Message selection'
          description='Which assistant messages to use. Messages with multiple content are flattened into individual ones'
          layout='horizontal'
        >
          <Select
            value={configuration.actualOutput?.messageSelection ?? 'last'}
            name='messageSelection'
            placeholder='Select an option'
            options={MESSAGE_SELECTION_OPTIONS}
            onChange={(value) =>
              setConfiguration({
                ...configuration,
                actualOutput: {
                  ...(configuration.actualOutput || {}),
                  messageSelection: value,
                },
              })
            }
            errors={errors?.['actualOutput.messageSelection']}
            disabled={disabled}
            required
          />
          <Select
            value={configuration.actualOutput?.contentFilter ?? ''}
            name='contentFilter'
            placeholder='No filter'
            options={CONTENT_FILTER_OPTIONS}
            removable={true}
            onChange={(value) =>
              setConfiguration({
                ...configuration,
                actualOutput: {
                  ...(configuration.actualOutput || {}),
                  contentFilter: value || undefined,
                },
              })
            }
            errors={errors?.['actualOutput.contentFilter']}
            disabled={disabled}
            required
          />
        </FormFieldGroup>
        <FormFieldGroup
          label='Parsing format'
          description='How to parse the assistant messages. Stringification is done deterministically'
          layout='horizontal'
          tooltip={
            actualFormatIsAccessible ? (
              <Text.H6 color='background'>
                Use a field accessor to extract a specific field from the output
                using dot notation.
                <br />
                <br />
                - Access a field: arguments, arguments.options (nested)
                <br />- Access a list: [0] (first), [-1] (last)
                <br />- Combine both: [0].arguments.options[-1]
              </Text.H6>
            ) : undefined
          }
        >
          <Select
            value={configuration.actualOutput?.parsingFormat ?? 'string'}
            name='parsingFormat'
            placeholder='Select an option'
            options={PARSING_FORMAT_OPTIONS}
            onChange={(value) =>
              setConfiguration({
                ...configuration,
                actualOutput: {
                  ...(configuration.actualOutput || {}),
                  parsingFormat: value,
                },
              })
            }
            errors={errors?.['actualOutput.parsingFormat']}
            disabled={disabled}
            required
          />
          {actualFormatIsAccessible && (
            <Input
              value={configuration.actualOutput?.fieldAccessor ?? ''}
              name='fieldAccessor'
              placeholder='No field'
              onChange={(e) =>
                setConfiguration({
                  ...configuration,
                  actualOutput: {
                    ...(configuration.actualOutput || {}),
                    fieldAccessor: e.target.value || undefined,
                  },
                })
              }
              errors={errors?.['actualOutput.fieldAccessor']}
              className='w-full px-3 h-8'
              disabled={disabled || !actualFormatIsAccessible}
              required
            />
          )}
        </FormFieldGroup>
      </FormFieldGroup>
      {showTest && !!configuration.actualOutput && (
        <div className='w-full flex flex-col gap-2 border-t-2 border-dashed border-border pt-4'>
          <ActualOutputTest configuration={testConfiguration} />
        </div>
      )}
      {requiresExpectedOutput && (
        <FormFieldGroup
          label='Expected output'
          description='How to extract the output, to evaluate against, from the dataset'
          descriptionPosition='top'
          layout='vertical'
          group
        >
          <FormFieldGroup
            label='Parsing format'
            description='How to parse the dataset column. Stringification is done deterministically'
            layout='horizontal'
            tooltip={
              expectedFormatIsAccessible ? (
                <Text.H6 color='background'>
                  Use a field accessor to extract a specific field from the
                  output using dot notation.
                  <br />
                  <br />
                  - Access a field: arguments, arguments.options (nested)
                  <br />- Access a list: [0] (first), [-1] (last)
                  <br />- Combine both: [0].arguments.options[-1]
                </Text.H6>
              ) : undefined
            }
          >
            <Select
              value={configuration.expectedOutput?.parsingFormat ?? 'string'}
              name='parsingFormat'
              placeholder='Select an option'
              options={PARSING_FORMAT_OPTIONS}
              onChange={(value) =>
                setConfiguration({
                  ...configuration,
                  expectedOutput: {
                    ...(configuration.expectedOutput || {}),
                    parsingFormat: value,
                  },
                })
              }
              errors={errors?.['expectedOutput.parsingFormat']}
              disabled={disabled}
              required
            />
            {expectedFormatIsAccessible && (
              <Input
                value={configuration.expectedOutput?.fieldAccessor ?? ''}
                name='fieldAccessor'
                placeholder='No field'
                onChange={(e) =>
                  setConfiguration({
                    ...configuration,
                    expectedOutput: {
                      ...(configuration.expectedOutput || {}),
                      fieldAccessor: e.target.value || undefined,
                    },
                  })
                }
                errors={errors?.['expectedOutput.fieldAccessor']}
                className='w-full px-3 h-8'
                disabled={disabled || !expectedFormatIsAccessible}
                required
              />
            )}
          </FormFieldGroup>
        </FormFieldGroup>
      )}
    </>
  )
}
