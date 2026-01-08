import fc from 'fast-check'

export const cbs = (op: string, ...args: string[]): string =>
  `{{${op}${args.length > 0 ? '::' : ''}${args.join('::')}}}`

export const trimVarPrefix = (key: unknown): string => {
  if (typeof key !== 'string') {
    return 'null'
  }

  if (key.startsWith('$')) {
    return key.slice(1)
  }

  if (key.startsWith('toggle_')) {
    return key.slice('toggle_'.length)
  }

  return 'null'
}

/** No hashes, colons, curly braces, line breaks */
export const validCBSArgRegExp = /^[^#:{}\r\n]+$/
/** {@link validCBSArgRegExp `validCBSArgRegExp`} */
export const validCBSArgProp = fc.oneof(
  fc.stringMatching(validCBSArgRegExp),
  fc.string({ unit: 'grapheme' }).filter((s) => validCBSArgRegExp.test(s))
)
