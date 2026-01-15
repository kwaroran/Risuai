import fc from 'fast-check'
import { writable } from 'svelte/store'
import { beforeEach, expect, test, vi } from 'vitest'
import { DBState } from '../../stores.svelte'
import { getChatVar, getGlobalChatVar, setChatVar } from '../chatVar.svelte'

//#region module mocks

vi.mock(
  import('../../storage/database.svelte'),
  () =>
    ({
      appVer: '1234.5.67',
      getCurrentCharacter: () => ({}),
      getDatabase: () => ({}),
    } as typeof import('../../storage/database.svelte'))
)

vi.mock(import('../../globalApi.svelte'), () => ({
  aiWatermarkingLawApplies: () => false,
  getFileSrc: () => Promise.resolve(''),
}))

vi.mock(import('../../stores.svelte'), () => {
  return {
    DBState: {
      db: {
        characters: [
          {
            chatPage: 0,
            chats: [
              {
                scriptstate: {},
              },
            ],
            defaultVariables: '',
          },
        ],
        globalChatVariables: {},
        templateDefaultVariables: '',
      },
    },
    selectedCharID: writable(0),
  } as typeof import('../../stores.svelte')
})

//#endregion

beforeEach(() => {
  vi.resetAllMocks()
})

test('can get and set a chat variable', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'grapheme' }), fc.anything().filter((v) => v !== undefined).map(JSON.stringify), (key, value) => {
      setChatVar(key, value)
      expect(getChatVar(key)).toBe(value)
    }),
  )
})

test('can get a global chat variable', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'grapheme' }), fc.anything().filter((v) => v !== undefined).map(JSON.stringify), (key, value) => {
      DBState.db.globalChatVariables[`toggle_${key}`] = value
      expect(getGlobalChatVar(`toggle_${key}`)).toBe(value)
    }),
  )
})

test('returns "null" for undefined variables', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'grapheme' }), (key) => {
      expect(getChatVar(key)).toBe('null')
      expect(getGlobalChatVar(`toggle_${key}`)).toBe('null')
    }),
  )
})
