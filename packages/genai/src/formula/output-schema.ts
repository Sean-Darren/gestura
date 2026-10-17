/** Plain JSON Schema for structured-output APIs; Zod remains the response validator. */
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const nullableStrings = { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] }
export const FORMULA_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['ok', 'needs_clarification', 'unsupported'] },
    formula: nullableString,
    targetCell: nullableString,
    references: nullableStrings,
    functionsUsed: nullableStrings,
    explanation: { type: 'string' },
    clarificationQuestion: nullableString
  },
  required: [
    'status',
    'formula',
    'targetCell',
    'references',
    'functionsUsed',
    'explanation',
    'clarificationQuestion'
  ]
}
