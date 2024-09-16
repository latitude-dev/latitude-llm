import {
  createProviderLog,
  CreateProviderLogProps,
} from '../../services/providerLogs'

export const createProviderLogJob = async ({
  data,
}: {
  data: Omit<CreateProviderLogProps, 'generatedAt'> & { generatedAt: string }
}) => {
  return await createProviderLog({
    ...data,
    generatedAt: new Date(data.generatedAt),
  }).then((r) => r.unwrap())
}
