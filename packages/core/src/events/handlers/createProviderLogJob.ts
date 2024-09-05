import { AIProviderCallCompleted } from '.'
import { createProviderLog } from '../../services/providerLogs'

export const createProviderLogJob = async ({
  data: event,
}: {
  data: AIProviderCallCompleted
}) => {
  await createProviderLog(event.data)
}
