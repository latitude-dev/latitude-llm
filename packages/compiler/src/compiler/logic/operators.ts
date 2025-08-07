// https://github.com/estree/estree/blob/master/es5.md#binary-operations
export const BINARY_OPERATOR_METHODS: {
  [operator: string]: (left: any, right: any) => unknown
} = {
  // BinaryExpression
  '==': (left, right) => left === right,
  '!=': (left, right) => left !== right,
  '===': (left, right) => left === right,
  '!==': (left, right) => left !== right,
  '<': (left, right) => left < right,
  '<=': (left, right) => left <= right,
  '>': (left, right) => left > right,
  '>=': (left, right) => left >= right,
  '<<': (left, right) => left << right,
  '>>': (left, right) => left >> right,
  '>>>': (left, right) => left >>> right,
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '*': (left, right) => left * right,
  '/': (left, right) => left / right,
  '%': (left, right) => left % right,
  '|': (left, right) => left | right,
  '^': (left, right) => left ^ right,
  '&': (left, right) => left & right,
  in: (left, right) => left in right,
  instanceof: (left, right) => (left as object) instanceof right,

  // LogicalExpression
  '||': (left, right) => left || right,
  '&&': (left, right) => left && right,
  '??': (left, right) => left ?? right,
}

// https://github.com/estree/estree/blob/master/es5.md#unary-operations
export const UNARY_OPERATOR_METHODS: {
  [operator: string]: (value: any, prefix: any) => unknown
} = {
  // UnaryExpression
  '-': (value, prefix) => (prefix ? -value : value),
  '+': (value, prefix) => (prefix ? +value : value),
  '!': (value, _) => !value,
  '~': (value, _) => ~value,
  typeof: (value, _) => typeof value,
  void: (value, _) => void value,
}

// https://github.com/estree/estree/blob/master/es5.md#memberexpression
export const MEMBER_EXPRESSION_METHOD = (object: any, property: any): unknown => {
  const value = object[property]
  return typeof value === 'function' ? value.bind(object) : value
}

// https://github.com/estree/estree/blob/master/es5.md#assignmentexpression
export const ASSIGNMENT_OPERATOR_METHODS: {
  [operator: string]: (left: any, right: any) => unknown
} = {
  '=': (_, right) => right,
  '+=': (left, right) => left + right,
  '-=': (left, right) => left - right,
  '*=': (left, right) => left * right,
  '/=': (left, right) => left / right,
  '%=': (left, right) => left % right,
  '<<=': (left, right) => left << right,
  '>>=': (left, right) => left >> right,
  '>>>=': (left, right) => left >>> right,
  '|=': (left, right) => left | right,
  '^=': (left, right) => left ^ right,
  '&=': (left, right) => left & right,
}
