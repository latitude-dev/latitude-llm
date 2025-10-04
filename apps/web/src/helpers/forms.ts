import { inferServerActionInput, TAnyZodSafeFunctionHandler } from 'zsa'

export function formDataToAction<
  T extends (data: any) => Promise<[any, null] | [null, any]>,
>(data: FormData): inferServerActionInput<TAnyZodSafeFunctionHandler & T> {
  const obj: { [key: string]: unknown } = {}
  data.forEach((value, key) => (obj[key] = value))
  return obj as inferServerActionInput<TAnyZodSafeFunctionHandler & T>
}
