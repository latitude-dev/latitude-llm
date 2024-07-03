import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '../constants'

function getKlassName(error: unknown): string {
  const errorKlass = error as Error
  return errorKlass.constructor ? errorKlass.constructor.name : 'Error'
}

export default {
  unexpectedEof: {
    code: 'unexpected-eof',
    message: 'Unexpected end of input',
  },
  unexpectedEofToken: (token: string) => ({
    code: 'unexpected-eof',
    message: `Unexpected '${token}'`,
  }),
  unexpectedToken: (token: string) => ({
    code: 'unexpected-token',
    message: `Expected '${token}'`,
  }),
  unexpectedBlockClose: {
    code: 'unexpected-block-close',
    message: 'Unexpected block closing tag',
  },
  invalidElseif: {
    code: 'invalid-elseif',
    message: "'elseif' should be 'else if'",
  },
  invalidElseifPlacementUnclosedBlock: (block: string) => ({
    code: 'invalid-elseif-placement',
    message: `Expected to close ${block} before seeing {:else if ...} block`,
  }),
  invalidElseifPlacementOutsideIf: {
    code: 'invalid-elseif-placement',
    message: 'Cannot have an {:else if ...} block outside an {#if ...} block',
  },
  invalidElsePlacementUnclosedBlock: (block: string) => ({
    code: 'invalid-else-placement',
    message: `Expected to close ${block} before seeing {:else} block`,
  }),
  invalidElsePlacementOutsideIf: {
    code: 'invalid-else-placement',
    message:
      'Cannot have an {:else} block outside an {#if ...} or {#each ...} block',
  },
  expectedBlockType: {
    code: 'expected-block-type',
    message: 'Expected if or each',
  },
  unexpectedTokenDestructure: {
    code: 'unexpected-token',
    message: 'Expected identifier or destructure pattern',
  },
  expectedName: {
    code: 'expected-name',
    message: 'Expected name',
  },
  unexpectedMustacheCloseTag: {
    code: 'unexpected-mustache-close-tag',
    message: 'Unexpected closing tag without matching opening tag',
  },
  unclosedComment: {
    code: 'unclosed-comment',
    message: 'Unclosed comment',
  },
  unexpectedEndOfComment: {
    code: 'unexpected-end-of-comment',
    message: 'Unexpected end of comment',
  },
  invalidTagName: {
    code: 'invalid-tag-name',
    message: 'Expected valid tag name',
  },
  duplicateAttribute: {
    code: 'duplicate-attribute',
    message: 'Attributes need to be unique',
  },
  unclosedAttributeValue: (token: string) => ({
    code: 'unclosed-attribute-value',
    message: `Expected to close the attribute value with ${token}`,
  }),
  missingAttributeValue: {
    code: 'missing-attribute-value',
    message: 'Expected value for the attribute',
  },
  invalidLogicBlockPlacement: (location: string, name: string) => ({
    code: 'invalid-logic-block-placement',
    message: `${CUSTOM_TAG_START}#${name}${CUSTOM_TAG_END} block cannot be ${location}`,
  }),
  invalidConfig: (message: string) => ({
    code: 'invalid-config',
    message: `Invalid config: ${message}`,
  }),
  invalidConfigPosition: {
    code: 'invalid-config-position',
    message: 'Configs must be defined on the first line of the file',
  },
  unexpectedTagClose: (name: string) => ({
    code: 'unexpected-tag-close',
    message: `Unexpected closing tag for ${name}`,
  }),

  // Compiler errors:
  queryNotFound: (name: string) => ({
    code: 'query-not-found',
    message: `Query '${name}' not found`,
  }),
  unsupportedBaseNodeType: (type: string) => ({
    code: 'unsupported-base-node-type',
    message: `Unsupported base node type: ${type}`,
  }),
  unsupportedExpressionType: (type: string) => ({
    code: 'unsupported-expression-type',
    message: `Unsupported expression type: ${type}`,
  }),
  invalidConstantDefinition: {
    code: 'invalid-constant-definition',
    message: 'Constant definitions must assign a value to a variable',
  },
  invalidConfigDefinition: {
    code: 'invalid-config-definition',
    message: 'Config definitions must assign a value to an option',
  },
  invalidConfigValue: {
    code: 'invalid-config-value',
    message:
      'Config values must be literals. Cannot use variables or expressions',
  },
  configInsideBlock: {
    code: 'config-inside-block',
    message: 'Cannot must be defined at root level. Cannot be inside a block',
  },
  configDefinitionFailed: (name: string, message: string) => ({
    code: 'config-definition-failed',
    message: `Config definition for '${name}' failed: ${message}`,
  }),
  configAlreadyDefined: (name: string) => ({
    code: 'config-already-defined',
    message: `Config definition for '${name}' failed: Option already configured`,
  }),
  variableAlreadyDeclared: (name: string) => ({
    code: 'variable-already-declared',
    message: `Variable '${name}' is already declared`,
  }),
  variableNotDeclared: (name: string) => ({
    code: 'variable-not-declared',
    message: `Variable '${name}' is not declared`,
  }),
  invalidObjectKey: {
    code: 'invalid-object-key',
    message: 'Invalid object key',
  },
  invalidSpreadInObject: (property: string) => ({
    code: 'invalid-spread-in-object',
    message: `Property '${property}' is not valid for spreading`,
  }),
  invalidSpreadInArray: (element: string) => ({
    code: 'invalid-spread-in-array',
    message: `Element '${element}' is not iterable`,
  }),
  unsupportedOperator: (operator: string) => ({
    code: 'unsupported-operator',
    message: `Unsupported operator: ${operator}`,
  }),
  constantReassignment: {
    code: 'constant-reassignment',
    message: 'Cannot reassign a constant',
  },
  invalidAssignment: {
    code: 'invalid-assignment',
    message: 'Invalid assignment',
  },
  invalidUpdate: (operation: string, type: string) => ({
    code: 'invalid-update',
    message: `Cannot use ${operation} operation on ${type}`,
  }),

  propertyNotExists: (property: string) => ({
    code: 'property-not-exists',
    message: `Property '${property}' does not exist on object`,
  }),
  unknownFunction: (name: string) => ({
    code: 'unknown-function',
    message: `Unknown function: ${name}`,
  }),
  notAFunction: (objectType: string) => ({
    code: 'not-a-function',
    message: `'${objectType}' is not a function`,
  }),
  functionCallError: (err: unknown) => {
    const error = err as Error
    const errorKlassName = getKlassName(error)
    return {
      code: 'function-call-error',
      message: `Error calling function: \n${errorKlassName} ${error.message}`,
    }
  },
  functionRequiresStaticArguments: (name: string) => ({
    code: 'function-requires-static-arguments',
    message: `Function '${name}' can only receive literal values as arguments`,
  }),
  functionRequiresInterpolation: (name: string) => ({
    code: 'function-requires-interpolation',
    message: `Function '${name}' cannot be used inside a logic block. It must be directly interpolated into the query`,
  }),
  functionDisallowsInterpolation: (name: string) => ({
    code: 'function-disallows-interpolation',
    message: `Function '${name}' cannot be directly interpolated into the query`,
  }),
  invalidFunctionResultInterpolation: {
    code: 'invalid-function-result-interpolation',
    message: 'Functions called for interpolation must return a string',
  },
  invalidTagPlacement: (name: string, parent: string) => ({
    code: 'invalid-tag-placement',
    message: `Cannot have a ${name} tag inside of a ${parent} tag`,
  }),
  messageTagInsideMessage: {
    code: 'message-tag-inside-message',
    message: 'Message tags cannot be inside of another message',
  },
  invalidMessageRole: (name: string) => ({
    code: 'invalid-message-role',
    message: `Invalid message role: ${name}`,
  }),
  messageTagWithoutRole: {
    code: 'message-tag-without-role',
    message: 'Message tags must have a role attribute',
  },
  referenceTagWithoutPrompt: {
    code: 'reference-tag-without-prompt',
    message: 'Reference tags must have a prompt attribute',
  },
  missingReferenceFunction: {
    code: 'missing-reference-function',
    message: 'A reference function was not provided',
  },
  referenceError: (err: unknown) => {
    const error = err as Error
    const errorKlassName = getKlassName(error)
    return {
      code: 'reference-error',
      message: `There was an error referencing the prompt: \n${errorKlassName} ${error.message}`,
    }
  },
  invalidContentType: (name: string) => ({
    code: 'invalid-content-type',
    message: `Invalid content type: ${name}`,
  }),
  invalidStaticAttribute: (name: string) => ({
    code: 'invalid-static-attribute',
    message: `The attribute '${name}' must only contain literal values`,
  }),
}
