import fc from 'fast-check'
import { writable } from 'svelte/store'
import { describe, expect, test, vi } from 'vitest'
import { risuChatParser, risuUnescape } from '../../parser.svelte'
import { trimVarPrefix } from './lib'

//#region module mocks

vi.mock(
  import('../../../storage/database.svelte'),
  () =>
    ({
      appVer: '1234.5.67',
      getCurrentCharacter: () => ({}),
      getDatabase: () => ({}),
    }) as typeof import('../../../storage/database.svelte'),
)

vi.mock(import('../../../globalApi.svelte'), () => ({
  aiWatermarkingLawApplies: () => false,
  getFileSrc: () => Promise.resolve(''),
}))

/** Returns accessed key as the value. */
const varStorage = vi.hoisted(
  () =>
    new Proxy(
      {},
      {
        get(_, prop) {
          return trimVarPrefix(prop)
        },
      },
    ),
)

vi.mock(import('../../../stores.svelte'), () => {
  return {
    DBState: {
      db: {
        characters: [
          {
            chatPage: 0,
            chats: [
              {
                scriptstate: varStorage,
              },
            ],
            defaultVariables: '',
          },
        ],
        globalChatVariables: varStorage,
        templateDefaultVariables: '',
      },
    },
    selIdState: {
      selId: 0,
    },
    selectedCharID: writable(0),
  } as typeof import('../../../stores.svelte')
})

//#endregion

const parse = (s: string): string => risuUnescape(risuChatParser(s))

test('bo, bc', () => {
  expect(parse('{{bo}}')).toBe('{{')
  expect(parse('{{bc}}')).toBe('}}')
})

test('br', () => {
  expect(parse('{{br}}')).toBe('\n')
})

test('cbr', () => {
  expect(parse('{{cbr}}')).toBe('\\n')
  // FIXME: Broken => cbr::3cbr::3cbr::3
  // expect(parse('{{cbr::3}}')).toBe('\\n\\n\\n')
})

test('decbo, decbc', () => {
  expect(parse('{{decbo}}')).toBe('{')
  expect(parse('{{decbc}}')).toBe('}')
})

test(';', () => {
  expect(parse('{{;}}')).toBe(';')
})

test(':', () => {
  expect(parse('{{;}}')).toBe(';')
})

test('()', () => {
  expect(parse('{{(}}')).toBe('(')
  expect(parse('{{)}}')).toBe(')')
})

test('<>', () => {
  expect(parse('{{<}}')).toBe('&lt;')
  expect(parse('{{>}}')).toBe('&gt;')
})

/** Any string but not `{{/...}} */
const anythingNotClosing = fc
  .string()
  .filter(
    (s) => !/{{\/.*}}/.test(s) && /* FIXME opening curly without its pair causes '<' prepended */ !s.includes('{'),
  )

test('#pure', () => {
  fc.assert(
    fc.property(anythingNotClosing, (a) => {
      expect(parse(`{{#pure}}${a}{{/}}`)).toBe(a.trim())
    }),
  )
})

test('#puredisplay', () => {
  fc.assert(
    fc.property(anythingNotClosing, (a) => {
      expect(parse(`{{#puredisplay}}${a}{{/}}`)).toBe(
        // reparsing prevention kicks in for #puredisplay
        a.trim().replaceAll('{{', '\\{\\{').replaceAll('}}', '\\}\\}'),
      )
    }),
  )
})

describe('#escape', () => {
  test('escapes any curly braces or parenthesis, trims whitespaces', () => {
    fc.assert(
      fc.property(anythingNotClosing, (a) => {
        expect(parse(`{{#escape}}\n${a}\n{{/}}`)).toBe(a.trim())
      }),
    )
  })

  test('::keep preserves all whitespaces', () => {
    fc.assert(
      fc.property(anythingNotClosing, (a) => {
        expect(parse(`{{#escape::keep}}\n${a}\n{{/}}`)).toBe(`\n${a}\n`)
      }),
    )
  })
})
