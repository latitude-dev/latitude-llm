import {
  createProviderLog,
  CreateProviderLogProps,
} from '../../services/providerLogs'

export type CreateProviderLogJobProps = Omit<
  CreateProviderLogProps,
  'generatedAt'
> & { generatedAt: string }

export const createProviderLogJob = async ({
  data,
}: {
  data: CreateProviderLogJobProps
}) => {
  return await createProviderLog({
    ...data,
    generatedAt: new Date(data.generatedAt),
  }).then((r) => r.unwrap())
}
