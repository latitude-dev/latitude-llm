import {
  createRunError as createFn,
  CreateRunErrorProps,
} from '../../services/runErrors/create'

export async function createRunError(data: CreateRunErrorProps['data']) {
  return createFn({ data }).then((r) => r.unwrap())
}
