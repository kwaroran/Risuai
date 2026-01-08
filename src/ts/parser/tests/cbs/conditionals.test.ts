import fc from 'fast-check'
import { writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { risuChatParser } from '../../../parser.svelte'
import type { character } from '../../../storage/database.svelte'

//#region module mocks

// Suppress warning
vi.mock(import('katex'), () => ({}))

vi.mock(
  import('../../../storage/database.svelte'),
  () =>
    ({
      appVer: '1234.5.67',
      getCurrentCharacter: () =>
        ({
          name: '',
          // @ts-expect-error Only fields needed in the current test suite
        } satisfies character),
      getDatabase: () => ({}),
    } as typeof import('../../../storage/database.svelte'))
)

vi.mock(import('../../../globalApi.svelte'), () => ({
  aiWatermarkingLawApplies: () => false,
  getFileSrc: () => Promise.resolve(''),
}))

/** Returns accessed key as its value. */
const varMapProxy = vi.hoisted(
  () =>
    new Proxy(
      {},
      {
        get(_, prop) {
          if (typeof prop !== 'string') {
            return 'null'
          }

          if (prop.startsWith('$')) {
            return prop.slice(1)
          }

          if (prop.startsWith('toggle_')) {
            return prop.slice('toggle_'.length)
          }
        },
      }
    )
)

vi.mock(import('../../../stores.svelte'), () => {
  // @ts-expect-error Minimal mock
  return {
    DBState: {
      db: {
        characters: {
          char: {
            chatPage: 0,
            chats: [
              {
                scriptstate: varMapProxy,
              },
            ],
            defaultVariables: '',
          },
        },
        globalChatVariables: varMapProxy,
        templateDefaultVariables: '',
      },
    },
    selectedCharID: writable('char'),
  } as typeof import('../../../stores.svelte')
})

vi.stubGlobal('safeStructuredClone', (v: unknown) => JSON.parse(JSON.stringify(v)))

//#endregion

/** No hashes, colons, curly braces, line breaks */
const validCBSArgProp = fc.stringMatching(/^[^#:{}\r\n]+$/)

const template = (op: string, body: string) => `0 {{${op}}}${body}{{/}} 9`
const quickParse = (...args: Parameters<typeof template>) => risuChatParser(template(...args))

const indentedBody = `

  C  
  B  
  S  

`

afterEach(() => {
  vi.resetAllMocks()
})

describe('#if', () => {
  test('renders when "1" or "true"', () => {
    expect(quickParse('#if 1', 'CBS')).toBe(`0 CBS 9`)
    expect(quickParse('#if true', 'CBS')).toBe(`0 CBS 9`)
  })

  test('does not render when anything else', async () => {
    expect(quickParse('#if 0', 'CBS')).toBe('0  9')
    expect(quickParse('#if false', 'CBS')).toBe('0  9')

    fc.assert(
      fc.property(
        validCBSArgProp.filter((s) => s !== '1' && s !== 'true'),
        (anythingElse) => {
          expect(quickParse(`#if ${anythingElse}`, 'CBS')).toBe(`0  9`)
        }
      )
    )
  })

  test('trims start of the block, end of the block, and start of each line', () => {
    expect(quickParse('#if 1', indentedBody)).toBe('0 C  \nB  \nS 9')
  })

  test('can be nested', () => {
    expect(quickParse('#if 1', template('#if 1', 'CBS'))).toBe(`0 0 CBS 9 9`)
    expect(quickParse('#if 1', template('#if 0', 'CBS'))).toBe(`0 0  9 9`)
    expect(quickParse('#if 0', template('#if 1', 'CBS'))).toBe(`0  9`)
    expect(quickParse('#if 0', template('#if 0', 'CBS'))).toBe(`0  9`)
  })
})

describe('#if_pure', () => {
  test('renders when "1" or "true"', () => {
    expect(quickParse('#if_pure 1', 'CBS')).toBe(`0 CBS 9`)
    expect(quickParse('#if_pure true', 'CBS')).toBe(`0 CBS 9`)
  })

  test('does not render when anything else', async () => {
    expect(quickParse('#if_pure 0', 'CBS')).toBe('0  9')
    expect(quickParse('#if_pure false', 'CBS')).toBe('0  9')

    fc.assert(
      fc.property(
        validCBSArgProp.filter((s) => s !== '1' && s !== 'true'),
        (anythingElse) => {
          expect(quickParse(`#if_pure ${anythingElse}`, 'CBS')).toBe(`0  9`)
        }
      )
    )
  })

  test('preserves all whitespaces', () => {
    expect(quickParse('#if_pure 1', indentedBody)).toBe(`0 ${indentedBody} 9`)
  })

  test('can be nested', () => {
    expect(quickParse('#if_pure 1', template('#if_pure 1', indentedBody))).toBe(`0 0 ${indentedBody} 9 9`)
    expect(quickParse('#if_pure 1', template('#if_pure 0', indentedBody))).toBe(`0 0  9 9`)
    expect(quickParse('#if_pure 0', template('#if_pure 1', indentedBody))).toBe(`0  9`)
    expect(quickParse('#if_pure 0', template('#if_pure 0', indentedBody))).toBe(`0  9`)
  })
})

describe('#when', () => {
  test('renders when "1" or "true"', () => {
    expect(quickParse('#when::1', 'CBS')).toBe(`0 CBS 9`)
    expect(quickParse('#when::true', 'CBS')).toBe(`0 CBS 9`)
  })

  test('does not render when anything else', async () => {
    expect(quickParse('#when::0', 'CBS')).toBe('0  9')
    expect(quickParse('#when::false', 'CBS')).toBe('0  9')

    fc.assert(
      fc.property(
        validCBSArgProp.filter((s) => s !== '1' && s !== 'true'),
        (anythingElse) => {
          expect(quickParse(`#when::${anythingElse}`, 'CBS')).toBe(`0  9`)
        }
      )
    )
  })

  test('removes line breaks at block start/end, preserves all other whitespaces', () => {
    expect(quickParse('#when::1', indentedBody)).toBe(`0 ${indentedBody.replaceAll(/(^\n+|\n+$)/g, '')} 9`)
  })

  test('can omit :: without operators', () => {
    expect(quickParse('#when 1', 'CBS')).toBe(`0 CBS 9`)
    expect(quickParse('#when 0', 'CBS')).toBe('0  9')
  })

  describe('Operators: equality/inequality', () => {
    test('::is, isnot', () => {
      fc.assert(
        fc.property(validCBSArgProp, validCBSArgProp, (a, b) => {
          fc.pre(a !== b)

          expect(quickParse(`#when::${a}::is::${a}`, 'CBS')).toBe('0 CBS 9')
          expect(quickParse(`#when::${a}::is::${b}`, 'CBS')).toBe('0  9')

          expect(quickParse(`#when::${a}::isnot::${a}`, 'CBS')).toBe('0  9')
          expect(quickParse(`#when::${a}::isnot::${b}`, 'CBS')).toBe('0 CBS 9')
        })
      )
    })

    test('::>, >=, <=, <', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          fc.pre(a > b)

          expect(quickParse(`#when::${a}::>::${a}`, 'CBS')).toBe('0  9')
          expect(quickParse(`#when::${a}::>::${b}`, 'CBS')).toBe('0 CBS 9')
          expect(quickParse(`#when::${b}::>::${a}`, 'CBS')).toBe('0  9')

          expect(quickParse(`#when::${a}::>=::${a}`, 'CBS')).toBe('0 CBS 9')
          expect(quickParse(`#when::${a}::>=::${b}`, 'CBS')).toBe('0 CBS 9')
          expect(quickParse(`#when::${b}::>=::${a}`, 'CBS')).toBe('0  9')

          expect(quickParse(`#when::${a}::<=::${a}`, 'CBS')).toBe('0 CBS 9')
          expect(quickParse(`#when::${a}::<=::${b}`, 'CBS')).toBe('0  9')
          expect(quickParse(`#when::${b}::<=::${a}`, 'CBS')).toBe('0 CBS 9')

          expect(quickParse(`#when::${a}::<::${a}`, 'CBS')).toBe('0  9')
          expect(quickParse(`#when::${a}::<::${b}`, 'CBS')).toBe('0  9')
          expect(quickParse(`#when::${b}::<::${a}`, 'CBS')).toBe('0 CBS 9')
        })
      )
    })
  })

  describe('Operators: logical', () => {
    test('::and', () => {
      expect(quickParse('#when::1::and::1', 'CBS')).toBe(`0 CBS 9`)
      expect(quickParse('#when::1::and::not::true', 'CBS')).toBe(`0  9`)

      expect(quickParse('#when::1::and::0', 'CBS')).toBe(`0  9`)
      expect(quickParse('#when::1::and::not::false', 'CBS')).toBe(`0 CBS 9`)
    })

    test('::or', () => {
      expect(quickParse('#when::0::or::1', 'CBS')).toBe(`0 CBS 9`)
      expect(quickParse('#when::0::or::not::true', 'CBS')).toBe(`0  9`)

      expect(quickParse('#when::0::or::0', 'CBS')).toBe(`0  9`)
      expect(quickParse('#when::0::or::not::false', 'CBS')).toBe(`0 CBS 9`)
    })
  })

  describe('Operators: whitespaces', () => {
    test('::keep preserves all whitespaces', () => {
      expect(quickParse('#when::keep::1', indentedBody)).toBe(`0 ${indentedBody} 9`)
    })

    test('::legacy trims start of the block, end of the block, and start of each line', () => {
      expect(quickParse('#when::legacy::1', indentedBody)).toBe(`0 C  \nB  \nS 9`)
    })
  })

  describe('Operators: variables', () => {
    test('::var, toggle', () => {
      expect(quickParse('#when::var::true', 'CBS')).toBe(`0 CBS 9`)
      expect(quickParse('#when::toggle::true', 'CBS')).toBe(`0 CBS 9`)

      fc.assert(
        fc.property(
          validCBSArgProp.filter((s) => s !== '1' && s !== 'true'),
          (anythingElse) => {
            expect(quickParse(`#when::var::${anythingElse}`, 'CBS')).toBe(`0  9`)
            expect(quickParse(`#when::toggle::${anythingElse}`, 'CBS')).toBe(`0  9`)
          }
        )
      )
    })

    test('::vis, visnot', () => {
      fc.assert(
        fc.property(validCBSArgProp, validCBSArgProp, (a, b) => {
          fc.pre(a !== b)

          expect(quickParse(`#when::${a}::vis::${a}`, 'CBS')).toBe(`0 CBS 9`)
          expect(quickParse(`#when::${a}::vis::${b}`, 'CBS')).toBe(`0  9`)
          expect(quickParse(`#when::${a}::tis::${a}`, 'CBS')).toBe(`0 CBS 9`)
          expect(quickParse(`#when::${a}::tis::${b}`, 'CBS')).toBe(`0  9`)

          expect(quickParse(`#when::${a}::visnot::${a}`, 'CBS')).toBe(`0  9`)
          expect(quickParse(`#when::${a}::visnot::${b}`, 'CBS')).toBe(`0 CBS 9`)
          expect(quickParse(`#when::${a}::tisnot::${a}`, 'CBS')).toBe(`0  9`)
          expect(quickParse(`#when::${a}::tisnot::${b}`, 'CBS')).toBe(`0 CBS 9`)
        })
      )
    })
  })

  describe('else', () => {
    test('single line else', () => {
      expect(quickParse('#when::1', 'CBS{{:else}}SBC')).toBe(`0 CBS 9`)
      expect(quickParse('#when::0', 'CBS{{:else}}SBC')).toBe(`0 SBC 9`)
    })

    test('multiline else', () => {
      expect(quickParse('#when::1', 'CBS\n{{:else}}\nSBC')).toBe(`0 CBS 9`)
      expect(quickParse('#when::0', 'CBS\n{{:else}}\nSBC')).toBe(`0 SBC 9`)
    })

    test('with ::keep', () => {
      const revBody = [...indentedBody].reverse().join('')

      // FIXME: Unexpected line break removal before the {{:else}}
      expect(quickParse('#when::keep::1', `${indentedBody}{{:else}}${revBody}`)).toBe(
        `0 ${indentedBody.replace(/\n$/, '')} 9`
      )
      // FIXME: Unexpected line break removal after the {{:else}}
      expect(quickParse('#when::keep::0', `${indentedBody}{{:else}}${revBody}`)).toBe(
        `0 ${revBody.replace(/^\n/, '')} 9`
      )
    })
  })
})
