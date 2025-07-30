import { IntegrationType, McpTool } from '@latitude-data/constants'
import { IntegrationDto } from '../../../browser'
import { PromisedResult } from '../../../lib/Transaction'
import {
  LatitudeError,
  NotImplementedError,
} from '@latitude-data/constants/errors'
import { Result } from '../../../lib/Result'
import { listPipedreamIntegrationTriggers } from '../pipedream/listTriggers'
import { JSONSchema7 } from 'json-schema'
import { fixToolSchema } from './listTools/fixToolSchema'

export async function listTriggers(
  integration: IntegrationDto,
): PromisedResult<McpTool[], LatitudeError> {
  if (integration.type === IntegrationType.Pipedream) {
    const triggerResult = await listPipedreamIntegrationTriggers(integration)
    if (!Result.isOk(triggerResult)) {
      return Result.error(new LatitudeError(triggerResult.error.message))
    }

    const triggers = triggerResult.unwrap()
    const fixedTriggers = triggers.map((trigger) => ({
      ...trigger,
      inputSchema: fixToolSchema(trigger.inputSchema as JSONSchema7),
    }))
    return Result.ok(fixedTriggers as McpTool[])
  }

  // As Latitude is an integration, we must return its triggers
  if (integration.type === IntegrationType.Latitude) {
    const scheduledTrigger = {
      name: 'Scheduled Trigger',
      description: 'Trigger that runs on a schedule',
      inputSchema: {},
    }

    const emailTrigger = {
      name: 'Email Trigger',
      description: 'Trigger that runs when an email is received',
      inputSchema: {},
    }

    return Result.ok([scheduledTrigger, emailTrigger] as McpTool[])
  }

  return Result.error(new NotImplementedError('Unsupported integration type'))
}
