import type { RisuModule } from 'src/ts/process/modules'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RisuPlugin } from '../plugins.svelte'

const state = vi.hoisted(() => ({
    db: {
        modules: [] as RisuModule[],
        enabledModules: [] as string[],
    },
    storedPermissions: new Map<string, unknown>(),
    lastApi: null as any,
}))

const enabledModules = () => state.db.modules.filter((module) => state.db.enabledModules.includes(module.id))

vi.mock(import('./factory'), () => ({
    SandboxHost: class {
        constructor(api: any) {
            state.lastApi = api
        }
        run() {}
        terminate() {}
    },
} as unknown as typeof import('./factory')))

vi.mock(import('localforage'), () => ({
    default: {
        createInstance: () => ({
            getItem: async (key: string) => state.storedPermissions.get(key) ?? null,
            setItem: async (key: string, value: unknown) => {
                state.storedPermissions.set(key, value)
            },
        }),
    },
} as unknown as typeof import('localforage')))

vi.mock(import('src/lang'), async () => ({
    language: (await import('src/lang/en')).languageEnglish,
}))

vi.mock(import('src/ts/parser/parser.svelte'), () => ({
    hasher: async (data: Uint8Array) => 'hash of ' + new TextDecoder().decode(data),
    risuChatParser: vi.fn(),
} as unknown as typeof import('src/ts/parser/parser.svelte')))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: () => state.db,
} as unknown as typeof import('src/ts/storage/database.svelte')))

vi.mock(import('src/ts/stores.svelte'), async () => {
    const { writable } = await import('svelte/store')
    return {
        DBState: { db: state.db },
        alertStore: writable({ type: 'none', msg: '' }),
        additionalChatMenu: [],
        additionalFloatingActionButtons: [],
        additionalHamburgerMenu: [],
        additionalSettingsMenu: [],
        bodyIntercepterStore: [],
        chatPanelStore: [],
        selectedCharID: {},
    } as unknown as typeof import('src/ts/stores.svelte')
})

vi.mock(import('src/ts/process/modules'), () => ({
    getModuleLorebooks: vi.fn(),
    getModules: () => enabledModules(),
    getModuleMcps: () => enabledModules().map((module) => module.mcp?.url).filter((url) => url),
}))

vi.mock(import('../plugins.svelte'), () => ({
    allowedDbKeys: [],
    customProviderStore: {},
    getV2PluginAPIs: () => ({ safeLocalStorage: {} }),
    handlePluginInstallViaPlugin: vi.fn(),
    pluginV2: {},
} as unknown as typeof import('../plugins.svelte')))

vi.mock(import('src/ts/process/mcp/risuaccess'), async () => {
    const { MCPClientLike } = await import('src/ts/process/mcp/internalmcp')
    return {
        RisuAccessClient: class extends MCPClientLike {
            constructor() {
                super('internal:risuai')
            }
        },
    } as unknown as typeof import('src/ts/process/mcp/risuaccess')
})

vi.mock(import('../pluginSafeClass'), () => ({
    SafeLocalPluginStorage: class {},
    tagWhitelist: [],
} as unknown as typeof import('../pluginSafeClass')))

vi.mock(import('src/ts/globalApi.svelte'), () => ({
    checkCharOrder: vi.fn(),
    forageStorage: {},
    getFetchLogs: vi.fn(),
} as unknown as typeof import('src/ts/globalApi.svelte')))

vi.mock(import('src/ts/gui/colorscheme'), () => ({
    changeColorScheme: vi.fn(),
    updateColorScheme: vi.fn(),
    updateTextThemeAndCSS: vi.fn(),
}))

vi.mock(import('src/ts/process/coldstorage.svelte'), () => ({
    pluginStorage: {},
} as unknown as typeof import('src/ts/process/coldstorage.svelte')))

vi.mock(import('src/ts/process/index.svelte'), () => ({
    sendChat: vi.fn(),
    doingChat: {},
} as unknown as typeof import('src/ts/process/index.svelte')))

vi.mock(import('src/ts/util'), () => ({
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
} as unknown as typeof import('src/ts/util')))

vi.mock(import('src/ts/platform'), () => ({ isTauri: false, isNodeServer: false }))
vi.mock(import('src/ts/process/mcp/mcplib'), () => ({}))
vi.mock(import('src/ts/process/files/inlays'), () => ({ getInlayAsset: vi.fn() }))
vi.mock(import('src/ts/translator/translator'), () => ({ getLLMCache: vi.fn(), searchLLMCache: vi.fn() }))
vi.mock(import('src/ts/process/scripts'), () => ({ processScriptFull: vi.fn() }))
vi.mock(import('src/ts/model/modellist'), () => ({ getModelInfo: vi.fn() }))
vi.mock(import('src/ts/process/request/request'), () => ({ requestChatDataMain: vi.fn() }))

const startSession = async () => {
    vi.resetModules()
    const { executePluginV3 } = await import('./v3.svelte')
    const { registerMCPModule } = await import('src/ts/process/mcp/pluginmcp')
    const { alertStore } = await import('src/ts/stores.svelte')

    const shownDialogs: string[] = []
    alertStore.subscribe((alert) => {
        if (alert.type === 'ask') {
            shownDialogs.push(alert.msg)
        }
    })

    const toolCalls = vi.fn(async (toolName: string, content: any) => [{ type: 'text' as const, text: `${toolName} result` }])
    registerMCPModule(
        'Provider',
        { identifier: 'plugin:tools', name: 'Tools', version: '1.0.0', description: 'Test tools' },
        async () => [{ name: 'echo', description: '', inputSchema: {} }],
        toolCalls,
    )
    state.db.modules = [{ id: 'tools-module', name: 'Tools', description: '', mcp: { url: 'plugin:tools' } }]
    state.db.enabledModules = ['tools-module']

    await executePluginV3({ name: 'Consumer', script: 'script of Consumer' } as RisuPlugin)

    return {
        shownDialogs,
        toolCalls,
        consumer: state.lastApi,
        answerDialog: async (accept: boolean) => {
            await vi.waitFor(() => {
                if (get(alertStore).type !== 'ask') {
                    throw new Error('no consent dialog is open')
                }
            })
            alertStore.set({ type: 'none', msg: accept ? 'yes' : 'no' })
        },
    }
}

beforeEach(() => {
    state.db.modules = []
    state.db.enabledModules = []
    state.storedPermissions.clear()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('plugin access to enabled MCP modules', () => {
    it('asks the user, naming the plugin, before listing enabled MCP modules', async () => {
        const session = await startSession()

        const listing = session.consumer.getMCPs()
        await session.answerDialog(true)

        expect(await listing).toEqual([
            { id: 'tools-module', name: 'Tools', version: '1.0.0', description: 'Test tools' },
        ])
        expect(session.shownDialogs).toHaveLength(1)
        expect(session.shownDialogs[0]).toContain('Consumer')
    })

    it('gives no access when the user declines', async () => {
        const session = await startSession()

        const listing = session.consumer.getMCPs()
        await session.answerDialog(false)

        expect(await listing).toBeNull()
        expect(await session.consumer.getMCPToolList('tools-module')).toBeNull()
        expect(await session.consumer.callMCPTool('tools-module', 'echo', {})).toBeNull()
        expect(session.toolCalls).not.toHaveBeenCalled()
        expect(session.shownDialogs).toHaveLength(1)
    })

    it('lets an allowed plugin read and call the tools of an enabled MCP module', async () => {
        const session = await startSession()
        const listing = session.consumer.getMCPs()
        await session.answerDialog(true)
        const [mcp] = await listing

        const tools = await session.consumer.getMCPToolList(mcp.id)
        const result = await session.consumer.callMCPTool(mcp.id, 'echo', { text: 'hi' })

        expect(tools.map((tool: { name: string }) => tool.name)).toEqual(['echo'])
        expect(result).toEqual([{ type: 'text', text: 'echo result' }])
        expect(session.toolCalls).toHaveBeenCalledExactlyOnceWith('echo', { text: 'hi' })
        expect(session.shownDialogs).toHaveLength(1)
    })

    it('uses a stored grant in later sessions, and asks again once it is more than three days old', async () => {
        const day = 24 * 60 * 60 * 1000
        vi.useFakeTimers({ toFake: ['Date'] })
        const firstSession = await startSession()
        const firstListing = firstSession.consumer.getMCPs()
        await firstSession.answerDialog(true)
        await firstListing

        vi.setSystemTime(Date.now() + 2 * day)
        const sameWeekSession = await startSession()
        expect(await sameWeekSession.consumer.getMCPs()).toHaveLength(1)
        expect(sameWeekSession.shownDialogs).toEqual([])

        vi.setSystemTime(Date.now() + 2 * day)
        const laterSession = await startSession()
        const laterListing = laterSession.consumer.getMCPs()
        await laterSession.answerDialog(true)
        expect(await laterListing).toHaveLength(1)
        expect(laterSession.shownDialogs).toHaveLength(1)
    })

    it('does not let an allowed plugin call a module that is no longer enabled', async () => {
        const session = await startSession()
        const listing = session.consumer.getMCPs()
        await session.answerDialog(true)
        const [mcp] = await listing
        state.db.enabledModules = []

        await expect(session.consumer.callMCPTool(mcp.id, 'echo', {})).rejects.toThrow()

        expect(session.toolCalls).not.toHaveBeenCalled()
    })
})
