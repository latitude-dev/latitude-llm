import {
  createProviderLog,
  CreateProviderLogProps,
} from '../../services/providerLogs/create'

export type CreateProviderLogJobProps = Omit<
  CreateProviderLogProps,
  'generatedAt'
> & { generatedAt: string }

export const createProviderLogJob = async ({
  data,
}: {
  data: CreateProviderLogJobProps
}) => {
  await createProviderLog({
    ...data,
    generatedAt: new Date(data.generatedAt),
  }).then((r) => r.unwrap())
}
