import type { RisuModule } from 'src/ts/process/modules'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RisuPlugin } from '../plugins.svelte'

const state = vi.hoisted(() => ({
    db: {
        modules: [] as RisuModule[],
        enabledModules: [] as string[],
    },
    grantedPermissions: new Map<string, unknown>(),
    lastApi: null as any,
}))

vi.mock(import('./factory'), () => ({
    SandboxHost: class {
        iframe?: HTMLIFrameElement
        constructor(api: any) {
            state.lastApi = api
        }
        run(iframe: HTMLIFrameElement) {
            this.iframe = iframe
        }
        terminate() {
            this.iframe?.remove()
        }
    },
} as unknown as typeof import('./factory')))

vi.mock(import('localforage'), () => ({
    default: {
        createInstance: () => ({
            getItem: async (key: string) => state.grantedPermissions.get(key) ?? null,
            setItem: async (key: string, value: unknown) => {
                state.grantedPermissions.set(key, value)
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
    getModuleMcps: () => state.db.modules
        .filter((module) => state.db.enabledModules.includes(module.id))
        .map((module) => module.mcp?.url)
        .filter((url) => url),
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
    const { executePluginV3, loadV3Plugins } = await import('./v3.svelte')
    const { getMCPTools } = await import('src/ts/process/mcp/mcp')
    const { alertStore } = await import('src/ts/stores.svelte')

    const shownDialogs: string[] = []
    alertStore.subscribe((alert) => {
        if (alert.type === 'ask') {
            shownDialogs.push(alert.msg)
        }
    })

    const waitForDialog = () => vi.waitFor(() => {
        if (get(alertStore).type !== 'ask') {
            throw new Error('no consent dialog is open')
        }
    })

    const answerDialog = async (accept: boolean) => {
        await waitForDialog()
        alertStore.set({ type: 'none', msg: accept ? 'yes' : 'no' })
    }

    return {
        shownDialogs,
        waitForDialog,
        answerDialog,
        loadPlugin: async (name: string, script = `script of ${name}`) => {
            await executePluginV3({ name, script } as RisuPlugin)
            const api = state.lastApi
            const registerMCP = (info: Record<string, unknown> = {}, toolName = 'tool') => api.registerMCP(
                { identifier: 'plugin:tools', name: 'Tools', version: '1.0.0', description: 'Test tools', ...info },
                async () => [{ name: toolName, description: '', inputSchema: {} }],
                async () => [],
            ) as Promise<void>
            return {
                registerMCP,
                registerMCPAndAnswer: async (accept: boolean) => {
                    const registration = registerMCP()
                    await answerDialog(accept)
                    await registration
                },
            }
        },
        unloadPlugins: () => loadV3Plugins([]),
        toolNames: async () => (await getMCPTools()).map((tool) => tool.name),
    }
}

const removeModules = () => {
    state.db.modules = []
    state.db.enabledModules = []
}

const addEnabledModuleByHand = (identifier = 'plugin:tools') => {
    state.db.modules.push({ id: 'manual', name: 'Tools', description: '', mcp: { url: identifier } })
    state.db.enabledModules.push('manual')
}

beforeEach(() => {
    removeModules()
    state.grantedPermissions.clear()
})

describe('registerMCP consent', () => {
    it('asks the user, naming the plugin and the MCP identifier', async () => {
        const session = await startSession()
        const plugin = await session.loadPlugin('Weather')

        await plugin.registerMCPAndAnswer(true)

        expect(session.shownDialogs).toHaveLength(1)
        expect(session.shownDialogs[0]).toContain('Weather')
        expect(session.shownDialogs[0]).toContain('plugin:tools')
    })

    it('does not register the MCP or add a module when the user declines', async () => {
        const session = await startSession()
        const plugin = await session.loadPlugin('Weather')

        await plugin.registerMCPAndAnswer(false)

        expect(state.db.modules).toEqual([])
        expect(state.grantedPermissions.size).toBe(0)

        addEnabledModuleByHand()
        expect(await session.toolNames()).toEqual([])
    })

    it('registers the MCP and adds an enabled module on first consent', async () => {
        const session = await startSession()
        const plugin = await session.loadPlugin('Weather')

        await plugin.registerMCPAndAnswer(true)

        expect(state.db.modules.map((module) => module.mcp)).toEqual([{ url: 'plugin:tools' }])
        expect(state.db.enabledModules).toEqual([state.db.modules[0].id])
        expect(await session.toolNames()).toEqual(['tool'])
    })

    it('registers without asking again in a later session, and leaves a removed module removed', async () => {
        const firstSession = await startSession()
        await (await firstSession.loadPlugin('Weather')).registerMCPAndAnswer(true)
        removeModules()

        const laterSession = await startSession()
        await (await laterSession.loadPlugin('Weather')).registerMCP()

        expect(laterSession.shownDialogs).toEqual([])
        expect(state.db.modules).toEqual([])

        addEnabledModuleByHand()
        expect(await laterSession.toolNames()).toEqual(['tool'])
    })

    it('asks again when the plugin script changes', async () => {
        const firstSession = await startSession()
        await (await firstSession.loadPlugin('Weather', 'old script')).registerMCPAndAnswer(true)

        const laterSession = await startSession()
        await (await laterSession.loadPlugin('Weather', 'new script')).registerMCPAndAnswer(true)

        expect(laterSession.shownDialogs).toHaveLength(1)
    })

    it('unregisters the MCP when the plugin unloads', async () => {
        const session = await startSession()
        await (await session.loadPlugin('Weather')).registerMCPAndAnswer(true)
        expect(await session.toolNames()).toEqual(['tool'])

        await session.unloadPlugins()

        expect(await session.toolNames()).toEqual([])
    })

    it('rejects an identifier held by another plugin without asking the user', async () => {
        const session = await startSession()
        await (await session.loadPlugin('Weather')).registerMCPAndAnswer(true)
        const other = await session.loadPlugin('Other')

        await expect(other.registerMCP({}, 'other tool')).rejects.toThrow()

        expect(session.shownDialogs).toHaveLength(1)
        expect(await session.toolNames()).toEqual(['tool'])
    })

    it.each([
        ['an identifier that is not a plain string', { identifier: new String('plugin:tools') }],
        ['an identifier that spans several lines', { identifier: 'plugin:tools\nand more' }],
        ['a missing name', { name: undefined }],
    ])('rejects %s without asking the user', async (_, info) => {
        const session = await startSession()
        const plugin = await session.loadPlugin('Weather')

        await expect(plugin.registerMCP(info)).rejects.toThrow()

        expect(session.shownDialogs).toEqual([])
        expect(state.db.modules).toEqual([])
    })

    it('does not register the MCP of a plugin that unloaded while the user was deciding', async () => {
        const session = await startSession()
        const plugin = await session.loadPlugin('Weather')

        const registration = plugin.registerMCP()
        await session.waitForDialog()
        await session.unloadPlugins()
        await session.answerDialog(true)
        await registration

        expect(state.db.modules).toEqual([])
        addEnabledModuleByHand()
        expect(await session.toolNames()).toEqual([])
    })
})
