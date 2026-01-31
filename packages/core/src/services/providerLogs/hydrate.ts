import { type ProviderLog } from '../../schema/models/types/ProviderLog'
import {
  HydratedProviderLog,
  ProviderLogFileData,
} from '../../schema/models/types/ProviderLog'
import { diskFactory } from '../../lib/disk'
import { Result } from '../../lib/Result'

export async function hydrateProviderLog(providerLog: Partial<ProviderLog>) {
  if (!providerLog.fileKey) {
    // Fallback to existing columns for backwards compatibility
    return Result.ok(providerLog as HydratedProviderLog)
  }

  try {
    const disk = diskFactory('private')
    const fileContent = await disk.get(providerLog.fileKey)
    const fileData: ProviderLogFileData = JSON.parse(fileContent)

    return Result.ok({
      ...providerLog,
      ...fileData,
    } as HydratedProviderLog)
  } catch (_error) {
    // Fallback to existing columns if file storage fails
    return Result.ok({
      ...providerLog,
      config: providerLog.config,
      messages: providerLog.messages,
      output: providerLog.output,
      responseObject: providerLog.responseObject,
      responseText: providerLog.responseText,
      responseReasoning: providerLog.responseReasoning,
      toolCalls: providerLog.toolCalls,
    } as HydratedProviderLog)
  }
}
