import { Fragment } from '$/parser/interfaces'
import Ajv from 'ajv'
import type { ErrorObject, JTDDataType } from 'ajv/dist/core'

export function readConfig<ConfigSchema>(
  fragment: Fragment,
): JTDDataType<ConfigSchema> {
  for (const node of fragment.children) {
    if (node.type === 'Config') {
      return node.value as JTDDataType<ConfigSchema>
    }
  }
  return {} as JTDDataType<ConfigSchema>
}

export function validateConfig(
  config: object,
  schema: object,
): true | ErrorObject[] {
  const ajv = new Ajv()
  type Config = JTDDataType<typeof schema>

  const validate = ajv.compile<Config>(schema)
  const valid = validate(config)
  if (valid) return true
  return validate.errors!
}
