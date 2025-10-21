import { ConfigurablePropWithRemoteOptions } from '../../../../../constants'
import { PipedreamIntegration } from '../../../../../schema/models/types/Integration'
import { PromisedResult } from '../../../../../lib/Transaction'
import {
  PipedreamClient,
  ConfigurableProps,
  ConfiguredProps,
} from '@pipedream/sdk'
import { Result } from '../../../../../lib/Result'
import {
  addRemoteOptions,
  fetchFullConfigSchema,
  IRRELEVANT_PROP_TYPES,
} from './fetchFullConfigSchema'
import { reloadComponentProps } from '../../../../integrations/pipedream/components/reloadComponentProps'
import { LatitudeError } from '@latitude-data/constants/errors'
import { PipedreamIntegrationConfiguration } from '../../../../integrations/helpers/schema'
import { captureMessage } from '../../../../../utils/datadogCapture'

export async function validateLattesChoices({
  pipedream,
  componentId,
  integration,
  lattesChoices,
}: {
  pipedream: PipedreamClient
  componentId: string
  integration: PipedreamIntegration
  lattesChoices: ConfiguredProps<ConfigurableProps>
}): PromisedResult<boolean> {
  const fullTriggerConfigSchemaResult = await fetchFullConfigSchema({
    pipedream,
    componentId,
    integration,
  })

  if (!Result.isOk(fullTriggerConfigSchemaResult)) {
    return fullTriggerConfigSchemaResult
  }

  const fullTriggerConfigSchema = fullTriggerConfigSchemaResult.unwrap()

  // Validate that Lattes choices match the schema before checking for dynamic props (reloadProps)
  const isValid = await isValidConfiguration({
    lattesChoices,
    fullTriggerConfigSchema,
  })

  if (!Result.isOk(isValid)) {
    return isValid
  }

  const configurablePropsWithReload = fullTriggerConfigSchema.filter(
    (prop) => prop.reloadProps === true,
  )

  for (const prop of configurablePropsWithReload) {
    const reloadResult = await reloadComponentProps({
      integration,
      componentId: componentId,
      configuredProps: Object.fromEntries([
        [prop.name, lattesChoices[prop.name]],
      ]),
      pipedream,
    })

    if (!Result.isOk(reloadResult)) {
      return reloadResult
    }

    const reloadedProps = reloadResult.unwrap()

    if (reloadedProps.errors?.length) {
      return Result.error(
        new LatitudeError(
          `Failed to reload props for ${prop.name}: ${reloadedProps.errors.join(', ')}. Call again the tool with the same props.`,
        ),
      )
    }

    const relevantLattePropsFromReload =
      reloadedProps.dynamicProps?.configurableProps?.filter(
        (prop) => !IRRELEVANT_PROP_TYPES.includes(prop.type),
      ) ?? []

    // More performant way to check if the prop names are already in the full schema
    const propNamesWithRemoteOptions = new Set(
      fullTriggerConfigSchema.map((prop) => prop.name),
    )

    const newPropsFromReload = relevantLattePropsFromReload.filter(
      (prop) => !propNamesWithRemoteOptions.has(prop.name),
    )

    const newPropsFromReloadWithOptionsResult = await addRemoteOptions(
      componentId,
      pipedream,
      newPropsFromReload,
      integration,
      (integration.configuration as PipedreamIntegrationConfiguration)
        .externalUserId,
    )

    if (!Result.isOk(newPropsFromReloadWithOptionsResult)) {
      return newPropsFromReloadWithOptionsResult
    }

    const isValidReloaded = await isValidConfiguration({
      lattesChoices: lattesChoices,
      fullTriggerConfigSchema: [
        ...fullTriggerConfigSchema,
        ...newPropsFromReloadWithOptionsResult.unwrap(),
      ],
    })

    if (!Result.isOk(isValidReloaded)) {
      return isValidReloaded
    }
  }

  return Result.ok(true)
}

export async function isValidConfiguration({
  lattesChoices: latteChosenConfiguredProps,
  fullTriggerConfigSchema,
}: {
  lattesChoices: ConfiguredProps<ConfigurableProps>
  fullTriggerConfigSchema: ConfigurablePropWithRemoteOptions[]
}): PromisedResult<boolean> {
  const latteErrors: string[] = []
  for (const prop of fullTriggerConfigSchema) {
    const chosenPropValue = latteChosenConfiguredProps[prop.name]
    // Skip if optional and not provided
    if (prop.optional && !chosenPropValue) {
      continue
    }

    if (!chosenPropValue && !prop.type.includes('alert')) {
      latteErrors.push(
        `Missing value for configured prop ${prop.name}. Please provide a value based on the prop type and remote options for this prop.`,
      )
      continue
    }

    if (!isValidPropType(prop.type, chosenPropValue)) {
      latteErrors.push(
        `Invalid type for configured prop ${prop.name}. Expected ${prop.type}, but got ${getActualTypeDescription(chosenPropValue)}.`,
      )
      continue
    }

    if (
      prop.remoteOptionValues &&
      !prop.remoteOptionValues.containsAll(chosenPropValue as string)
    ) {
      latteErrors.push(
        `Invalid value for configured prop ${prop.name} with value ${chosenPropValue}. Expected one of: ${prop.remoteOptionValues.getFlattenedValues().join(', ')}`,
      )
    }
  }
  return latteErrors.length > 0
    ? Result.error(
        new LatteInvalidChoiceError(latteErrors, fullTriggerConfigSchema),
      )
    : Result.ok(true)
}

export class LatteInvalidChoiceError extends Error {
  public readonly errors: string[]
  public readonly fullSchema: ConfigurablePropWithRemoteOptions[]
  constructor(
    errors: string[],
    fullSchema: ConfigurablePropWithRemoteOptions[],
  ) {
    super('Latte choices are invalid')
    this.fullSchema = fullSchema
    this.errors = errors
  }
}

export function isValidPropType(propType: string, value: any): boolean {
  switch (propType) {
    case 'string':
      return typeof value === 'string'

    case 'string[]':
      return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      )

    case 'boolean':
      return typeof value === 'boolean'

    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)

    case 'integer[]':
      return (
        Array.isArray(value) &&
        value.every(
          (item) => typeof item === 'number' && Number.isInteger(item),
        )
      )

    case 'object':
      return (
        typeof value === 'object' && !Array.isArray(value) && value !== null
      )

    case 'any':
      return true

    case 'sql':
      return (
        typeof value === 'object' &&
        value !== null &&
        typeof value.app === 'string' &&
        typeof value.query === 'string' &&
        Array.isArray(value.params)
      )

    // Airtable-specific types - treated as strings
    case '$.airtable.baseId':
    case '$.airtable.tableId':
    case '$.airtable.viewId':
    case '$.airtable.fieldId':
      return typeof value === 'string'

    // Discord-specific types
    case '$.discord.channel':
      return typeof value === 'string'

    case '$.discord.channel[]':
      return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      )

    // Alert type should never have a value (it's display-only)
    case 'alert':
      return true

    default:
      // For unknown types, don't be permissive and capture a warning message
      captureMessage(`Unknown Pipedream prop type: ${propType}`, 'warning')
      return false
  }
}

function getActualTypeDescription(value: any): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
