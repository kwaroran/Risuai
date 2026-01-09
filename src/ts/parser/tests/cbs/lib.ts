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
