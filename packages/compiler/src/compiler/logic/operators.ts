// https://github.com/estree/estree/blob/master/es5.md#binary-operations
export const BINARY_OPERATOR_METHODS: {
  [operator: string]: (left: unknown, right: unknown) => unknown
} = {
  // BinaryExpression
  '==': (left, right) => (left as number) == (right as number),
  '!=': (left, right) => (left as number) != (right as number),
  '===': (left, right) => left === right,
  '!==': (left, right) => left !== right,
  '<': (left, right) => (left as number) < (right as number),
  '<=': (left, right) => (left as number) <= (right as number),
  '>': (left, right) => (left as number) > (right as number),
  '>=': (left, right) => (left as number) >= (right as number),
  '<<': (left, right) => (left as number) << (right as number),
  '>>': (left, right) => (left as number) >> (right as number),
  '>>>': (left, right) => (left as number) >>> (right as number),
  '+': (left, right) => (left as number) + (right as number),
  '-': (left, right) => (left as number) - (right as number),
  '*': (left, right) => (left as number) * (right as number),
  '/': (left, right) => (left as number) / (right as number),
  '%': (left, right) => (left as number) % (right as number),
  '|': (left, right) => (left as number) | (right as number),
  '^': (left, right) => (left as number) ^ (right as number),
  '&': (left, right) => (left as number) & (right as number),
  in: (left, right) => (left as string) in (right as object),
  instanceof: (left, right) =>
    (left as object) instanceof (right as (...args: unknown[]) => unknown),

  // LogicalExpression
  '||': (left, right) => left || right,
  '&&': (left, right) => left && right,
  '??': (left, right) => left ?? right,
}

// https://github.com/estree/estree/blob/master/es5.md#unary-operations
export const UNARY_OPERATOR_METHODS: {
  [operator: string]: (value: unknown, prefix: unknown) => unknown
} = {
  // UnaryExpression
  '-': (value, prefix) => (prefix ? -(value as number) : value),
  '+': (value, prefix) => (prefix ? +(value as number) : value),
  '!': (value, _) => !value,
  '~': (value, _) => ~(value as number),
  typeof: (value, _) => typeof value,
  void: (value, _) => void value,
}

// https://github.com/estree/estree/blob/master/es5.md#memberexpression
export const MEMBER_EXPRESSION_METHOD = (
  object: Record<string, unknown>,
  property: string,
): unknown => {
  const value = object[property]
  return typeof value === 'function' ? value.bind(object) : value
}

// https://github.com/estree/estree/blob/master/es5.md#assignmentexpression
export const ASSIGNMENT_OPERATOR_METHODS: {
  [operator: string]: (left: unknown, right: unknown) => unknown
} = {
  '=': (_, right) => right,
  '+=': (left, right) => (left as number) + (right as number),
  '-=': (left, right) => (left as number) - (right as number),
  '*=': (left, right) => (left as number) * (right as number),
  '/=': (left, right) => (left as number) / (right as number),
  '%=': (left, right) => (left as number) % (right as number),
  '<<=': (left, right) => (left as number) << (right as number),
  '>>=': (left, right) => (left as number) >> (right as number),
  '>>>=': (left, right) => (left as number) >>> (right as number),
  '|=': (left, right) => (left as number) | (right as number),
  '^=': (left, right) => (left as number) ^ (right as number),
  '&=': (left, right) => (left as number) & (right as number),
}
