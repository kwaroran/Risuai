import fc from 'fast-check'
import type { RisuModule } from 'src/ts/process/modules'
import type { customscript, loreBook } from 'src/ts/storage/database.svelte'
import { DBState } from 'src/ts/stores.svelte'
import { beforeEach, expect, test, vi } from 'vitest'
import type { RPCToolCallTextContent } from '../../mcplib'
import { ModuleHandler } from '../modules'

//#region module mocks

// Suppress consoles
vi.mock(import('katex'), () => ({}))
vi.mock(import('src/ts/lite'), () => ({}))

vi.mock(import('src/ts/alert'), () => ({
  alertConfirm: vi.fn(),
}))

vi.mock(import('src/ts/stores.svelte'), () => {
  return {
    DBState: {
      db: {
        enabledModules: [],
        modules: [],
      },
    },
  } as typeof import('src/ts/stores.svelte')
})

//#endregion

const makeLorebook = (name: string): loreBook => ({
  alwaysActive: false,
  comment: name,
  content: `${name}Content`,
  insertorder: 100,
  key: `${name}Key`,
  mode: 'normal',
  secondkey: '',
  selective: false,
})

const makeRegex = (name: string): customscript => ({
  ableFlag: true,
  comment: name,
  flag: '',
  in: `${name}In`,
  out: `${name}Out`,
  type: 'editdisplay',
})

const makeModule = (name: string): RisuModule => ({
  backgroundEmbedding: '<style>abc</style>',
  customModuleToggle: 'a=b\nc=d',
  id: name,
  description: `${name}Description`,
  lorebook: [],
  lowLevelAccess: false,
  name,
  regex: [],
  trigger: [],
})

const makeToolResponse = (text: unknown): RPCToolCallTextContent[] => [
  {
    text: typeof text === 'string' ? text : JSON.stringify(text),
    type: 'text',
  },
]

beforeEach(() => {
  vi.resetAllMocks()
})

test('lists installed modules with pagination', async () => {
  const instance = new ModuleHandler()

  const modules = Array(10)
    .fill(0)
    .map((_, i) => makeModule(String(i)))
  DBState.db.modules = modules
  DBState.db.enabledModules = [modules[0].id, modules[2].id]

  expect(await instance.handle('risu-list-modules', { count: 3 })).toMatchSnapshot()
  expect(await instance.handle('risu-list-modules', { count: 3, offset: 3 })).toMatchSnapshot()
  expect(await instance.handle('risu-list-modules', { count: 3, offset: 10 })).toMatchSnapshot()

  DBState.db.modules = []
  DBState.db.enabledModules = []

  expect(await instance.handle('risu-list-modules', {})).toEqual(makeToolResponse([]))
})

test('retrieves bgEmbedding, toggles, description, id, enabled, low level access, name fields of a module', async () => {
  const instance = new ModuleHandler()

  const modules = Array(10)
    .fill(0)
    .map((_, i) => makeModule(String(i)))
  DBState.db.modules = modules
  DBState.db.enabledModules = [modules[0].id, modules[2].id, modules[4].id]

  await fc.assert(
    fc.asyncProperty(
      fc.subarray([
        'backgroundEmbedding',
        'customModuleToggle',
        'description',
        'enabled',
        'id',
        'lowLevelAccess',
        'name',
      ]),
      fc.integer({ max: 9, min: 0 }),
      async (fieldsArg, targetIndex) => {
        const target = DBState.db.modules[targetIndex]
        const fields = fieldsArg.length > 0 ? fieldsArg : ['name', 'description', 'id', 'enabled']

        const expected = Object.fromEntries(
          fields.map((field) => {
            if (field === 'enabled') {
              return ['enabled', DBState.db.enabledModules.includes(target.id)]
            }
            return [field, target[field]]
          })
        )

        expect(await instance.handle('risu-get-module-info', { fields, id: target.id })).toEqual(
          makeToolResponse(expected)
        )
      }
    )
  )
})

test('lists lorebooks of a module with pagination', async () => {
  const instance = new ModuleHandler()

  const module: RisuModule = {
    ...makeModule('A'),
    lorebook: Array(10)
      .fill(0)
      .map((_, i) => makeLorebook(String(i))),
  }
  DBState.db.modules = [module]

  expect(await instance.handle('risu-list-module-lorebooks', { count: 3, id: 'A' })).toMatchSnapshot()
  expect(await instance.handle('risu-list-module-lorebooks', { count: 3, offset: 3, id: 'A' })).toMatchSnapshot()
  expect(await instance.handle('risu-list-module-lorebooks', { count: 3, offset: 10, id: 'A' })).toMatchSnapshot()

  module.lorebook = []

  expect(await instance.handle('risu-list-module-lorebooks', { id: 'A' })).toEqual(makeToolResponse([]))
})

test('retrieves fields of a lorebook', async () => {
  const instance = new ModuleHandler()

  const module: RisuModule = {
    ...makeModule('A'),
    lorebook: Array(3)
      .fill(0)
      .map((_, i) => makeLorebook(String(i))),
  }
  DBState.db.modules = [module]

  expect(await instance.handle('risu-get-module-lorebook', { id: 'A', names: ['0', '2', '99'] })).toMatchSnapshot()
})

test('lists all regex scripts of a module', async () => {
  const instance = new ModuleHandler()

  const module: RisuModule = {
    ...makeModule('A'),
    regex: Array(10)
      .fill(0)
      .map((_, i) => makeRegex(String(i))),
  }
  DBState.db.modules = [module]

  expect(await instance.handle('risu-get-module-regex-scripts', { id: 'A' })).toMatchSnapshot()

  module.regex = []

  expect(await instance.handle('risu-get-module-regex-scripts', { id: 'A' })).toEqual(makeToolResponse([]))
})

test('retrieves a module Lua script', async () => {
  const instance = new ModuleHandler()

  const module: RisuModule = {
    ...makeModule('A'),
    trigger: [
      {
        comment: '',
        conditions: [],
        effect: [{
          code: 'print("hello")',
          type: 'triggerlua'
        }],
        type: 'manual',
      }
    ]
  }
  DBState.db.modules = [module]

  expect(await instance.handle('risu-get-module-lua-script', { id: 'A' })).toEqual(makeToolResponse('print("hello")'))
})

test('errs retrieving a module Lua script if it is not using one', async () => {
  const instance = new ModuleHandler()

  DBState.db.modules = [makeModule('A')]

  expect(await instance.handle('risu-get-module-lua-script', { id: 'A' })).toEqual(makeToolResponse('Error: This module does not contain a Lua trigger.'))
})

test('errs if module not found', async () => {
  const instance = new ModuleHandler()
  const subjects = [
    'risu-get-module-info',
    'risu-set-module-info',
    'risu-list-module-lorebooks',
    'risu-get-module-lorebook',
    'risu-set-module-lorebook',
    'risu-delete-module-lorebook',
    'risu-get-module-regex-scripts',
    'risu-set-module-regex-script',
    'risu-delete-module-regex-script',
    'risu-get-module-lua-script',
    'risu-set-module-lua-script',
  ] as const

  const errors = await Promise.all(subjects.map((tool) => instance.handle(tool, { id: 'zzz' })))

  expect(errors.length).toBe(subjects.length)
  expect(
    errors
      .map((responses) => responses[0])
      .every((response) => (response as RPCToolCallTextContent).text === 'Error: Module with ID zzz not found.')
  ).toBe(true)
})
