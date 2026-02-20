import fc from 'fast-check'
import { writable } from 'svelte/store'
import { expect, test, vi } from 'vitest'
import { risuChatParser } from '../../parser.svelte'
import { cbs, trimVarPrefix, validCBSArgProp } from './lib'

//#region module mocks

vi.mock(
  import('../../../storage/database.svelte'),
  () =>
    ({
      appVer: '1234.5.67',
      getCurrentCharacter: () => ({}),
      getDatabase: () => ({}),
    } as typeof import('../../../storage/database.svelte'))
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
      }
    )
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

const validCBSArgPropLong = validCBSArgProp.filter((s) => s.length > 1)

const quickParse = (op: string, ...args: (string | number)[]) => risuChatParser(cbs(op, ...args.map(String)))

test('startswith, endswith, contains', () => {
  expect(quickParse('startswith', 'Hello World', 'Hello')).toBe('1')
  expect(quickParse('endswith', 'Hello World', 'World')).toBe('1')
  expect(quickParse('contains', 'Hello World', 'lo Wo')).toBe('1')

  fc.assert(
    fc.property(validCBSArgPropLong, validCBSArgPropLong, (a, b) => {
      fc.pre(!a.includes(b))

      expect(quickParse('startsWith', a, a.slice(0, -1))).toBe('1')
      expect(quickParse('startsWith', a, b)).toBe('0')

      expect(quickParse('endsWith', a, a.slice(-1))).toBe('1')
      expect(quickParse('endsWith', a, b)).toBe('0')

      expect(quickParse('contains', a, a.slice(0, -1))).toBe('1')
      expect(quickParse('contains', a, a.slice(-1))).toBe('1')
      expect(quickParse('contains', a, a)).toBe('1')
      expect(quickParse('contains', a, b)).toBe('0')
    })
  )
})

test('replace', () => {
  expect(quickParse('replace', 'Hello World', 'o', '0')).toBe('Hell0 W0rld')

  fc.assert(
    fc.property(validCBSArgPropLong, validCBSArgPropLong, (a, b) => {
      const randIndex = Math.floor(Math.random() * a.length)
      expect(quickParse('replace', a, a[randIndex], b)).toBe(a.replaceAll(a[randIndex], b))
    }),
  )
})

test('split', () => {
  expect(quickParse('split', 'apple,banana,cherry', ',')).toBe(JSON.stringify(['apple', 'banana', 'cherry']))

  fc.assert(
    fc.property(fc.array(validCBSArgPropLong), validCBSArgProp, (arr, b) => {
      const a = arr.join(b)

      expect(quickParse('split', a, b)).toBe(JSON.stringify(a.split(b)))
    }),
  )
})

test('trim', () => {
  expect(quickParse('trim', '  hello world  ')).toBe('hello world')
  expect(quickParse('trim', '  hello  \n  world  ')).toBe('hello  \n  world')

  fc.assert(
    fc.property(validCBSArgProp, (a) => {
      expect(quickParse('trim', a)).toBe(a.trim())
    }),
  )
})

test('length', () => {
  expect(quickParse('length', 'Hello')).toBe('5')

  fc.assert(
    fc.property(validCBSArgProp, (a) => {
      expect(quickParse('length', a)).toBe(String(a.length))
    }),
  )
})

test('capitalize, lower, upper', () => {
  expect(quickParse('capitalize', 'hello world')).toBe('Hello world')
  expect(quickParse('lower', 'Hello WORLD')).toBe('hello world')
  expect(quickParse('upper', 'Hello WORLD')).toBe('HELLO WORLD')

  fc.assert(
    fc.property(validCBSArgProp, (a) => {
      expect(quickParse('capitalize', a)).toBe(a.charAt(0).toUpperCase() + a.slice(1))
      expect(quickParse('lower', a)).toBe(a.toLocaleLowerCase())
      expect(quickParse('upper', a)).toBe(a.toLocaleUpperCase())
    }),
  )
})

// FIXME: {{reverse::ABC}} => CBA::esrever
test.skip('reverse', () => {
  const splitByPoints = (str: string) => [...str].reverse().join('')

  expect(quickParse('reverse', 'Hello World')).toBe('dlroW olleH')
  // No combiner: 👦‍👧‍👩‍👨
  // Intended behavior. See https://github.com/kwaroran/Risuai/pull/1151#issuecomment-3714792523
  expect(quickParse('reverse', '👨‍👩‍👧‍👦')).toBe(splitByPoints('👨‍👩‍👧‍👦'))

  fc.assert(
    fc.property(validCBSArgProp, (a) => {
      expect(quickParse('reverse', a)).toBe(splitByPoints(a))
    }),
  )
})

test('unicodeencode', () => {
  fc.assert(
    fc.property(validCBSArgProp, (a) => {
      const randIndex = Math.floor(Math.random() * a.length)
      expect(quickParse('unicodeencode', a, randIndex)).toBe(String(a.charCodeAt(randIndex)))
    }),
  )
})

test('unicodedecode, u', () => {
  fc.assert(
    fc.property(fc.integer(), (a) => {
      expect(quickParse('unicodedecode', a)).toBe(String.fromCharCode(a))
      expect(quickParse('u', a.toString(16))).toBe(String.fromCharCode(a))
    }),
  )
})
