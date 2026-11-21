import type { RisuModule } from 'src/ts/process/modules'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callEnabledMCPTool, getEnabledMCPs, getEnabledMCPToolList, initializeMCPs } from './mcp'
import { registeredCustomPluginMCPs, registerMCPModule } from './pluginmcp'

const state = vi.hoisted(() => ({
    db: {
        modules: [] as RisuModule[],
        enabledModules: [] as string[],
    },
    internalCallTool: null as any,
}))

const enabledModules = () => state.db.modules.filter((module) => state.db.enabledModules.includes(module.id))

vi.mock(import('localforage'), () => ({
    default: { createInstance: () => ({}) },
} as unknown as typeof import('localforage')))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: () => state.db,
} as unknown as typeof import('src/ts/storage/database.svelte')))

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: { db: state.db },
} as unknown as typeof import('src/ts/stores.svelte')))

vi.mock(import('../modules'), () => ({
    getModules: () => enabledModules(),
    getModuleMcps: () => enabledModules().map((module) => module.mcp?.url).filter((url) => url),
}))

vi.mock(import('src/ts/alert'), () => ({
    alertError: vi.fn(),
    alertInput: vi.fn(),
    alertNormal: vi.fn(),
}))

vi.mock(import('src/ts/util'), () => ({ sleep: vi.fn() }))
vi.mock(import('src/ts/platform'), () => ({ isTauri: false }))
vi.mock(import('./mcplib'), () => ({}))

vi.mock(import('./risuaccess'), async () => {
    const { MCPClientLike } = await import('./internalmcp')
    state.internalCallTool = vi.fn(async () => [])
    return {
        RisuAccessClient: class extends MCPClientLike {
            constructor() {
                super('internal:risuai')
            }
            async getToolList() {
                return [{ name: 'internal_tool', description: '', inputSchema: {} }]
            }
            callTool = state.internalCallTool
        },
    } as unknown as typeof import('./risuaccess')
})

const addMCP = (moduleId: string, address: string, toolName: string, enabled = true) => {
    const callTool = vi.fn(async () => [{ type: 'text' as const, text: `${moduleId} result` }])
    registerMCPModule(
        'owner',
        { identifier: address, name: `${moduleId} server`, version: '1.0.0', description: `${moduleId} instructions` },
        async () => [{ name: toolName, description: '', inputSchema: {} }],
        callTool,
    )
    state.db.modules.push({ id: moduleId, name: moduleId, description: '', mcp: { url: address } })
    if (enabled) {
        state.db.enabledModules.push(moduleId)
    }
    return callTool
}

afterEach(() => {
    vi.restoreAllMocks()
})

beforeEach(async () => {
    registeredCustomPluginMCPs.clear()
    state.db.modules = []
    state.db.enabledModules = []
    await initializeMCPs()
    state.internalCallTool?.mockClear()
})

describe('enabled MCP access', () => {
    it('lists enabled MCP modules by module id, without their address', async () => {
        addMCP('weather', 'plugin:weather-address', 'forecast')
        addMCP('disabled', 'plugin:disabled-address', 'unused', false)

        const mcps = await getEnabledMCPs()

        expect(mcps).toEqual([
            { id: 'weather', name: 'weather server', version: '1.0.0', description: 'weather instructions' },
        ])
        expect(JSON.stringify(mcps)).not.toContain('plugin:weather-address')
    })

    it('returns the tools of the chosen MCP module', async () => {
        addMCP('weather', 'plugin:weather-address', 'forecast')
        addMCP('news', 'plugin:news-address', 'headlines')

        const tools = await getEnabledMCPToolList('news')

        expect(tools.map((tool) => tool.name)).toEqual(['headlines'])
    })

    it('calls the tool on the chosen MCP module when another one has a tool with the same name', async () => {
        const weatherCallTool = addMCP('weather', 'plugin:weather-address', 'search')
        const newsCallTool = addMCP('news', 'plugin:news-address', 'search')

        const result = await callEnabledMCPTool('news', 'search', { query: 'today' })

        expect(result).toEqual([{ type: 'text', text: 'news result' }])
        expect(newsCallTool).toHaveBeenCalledExactlyOnceWith('search', { query: 'today' })
        expect(weatherCallTool).not.toHaveBeenCalled()
    })

    it('rejects a module once it is no longer enabled', async () => {
        const callTool = addMCP('weather', 'plugin:weather-address', 'forecast')
        await callEnabledMCPTool('weather', 'forecast', {})
        state.db.enabledModules = []

        await expect(getEnabledMCPToolList('weather')).rejects.toThrow()
        await expect(callEnabledMCPTool('weather', 'forecast', {})).rejects.toThrow()

        expect(callTool).toHaveBeenCalledOnce()
    })

    it('rejects a disabled module even while another enabled module uses the same MCP', async () => {
        const callTool = addMCP('first', 'plugin:shared-address', 'forecast')
        state.db.modules.push({ id: 'second', name: 'second', description: '', mcp: { url: 'plugin:shared-address' } })
        state.db.enabledModules = ['second']

        await expect(callEnabledMCPTool('first', 'forecast', {})).rejects.toThrow()
        await callEnabledMCPTool('second', 'forecast', {})

        expect(callTool).toHaveBeenCalledOnce()
    })

    it.each([
        ['listing modules', () => getEnabledMCPs()],
        ['reading tools', () => getEnabledMCPToolList('weather')],
        ['calling a tool', () => callEnabledMCPTool('weather', 'forecast', {})],
    ])('keeps MCP addresses out of the error when %s fails because a module cannot load', async (_, call) => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        addMCP('weather', 'plugin:weather-address', 'forecast')
        state.db.modules.push({ id: 'broken', name: 'broken', description: '', mcp: { url: 'stdio:secret-token-123' } })
        state.db.enabledModules.push('broken')

        const error: Error = await call().then(() => { throw new Error('the call succeeded') }, (reason) => reason)

        expect(error.message).not.toContain('secret-token-123')
    })

    it('does not reach the internal MCP that is callable without a module', async () => {
        addMCP('weather', 'plugin:weather-address', 'forecast')

        const ids = (await getEnabledMCPs()).map((mcp) => mcp.id)

        expect(ids).toEqual(['weather'])
        await expect(callEnabledMCPTool('internal:risuai', 'internal_tool', {})).rejects.toThrow()
        expect(state.internalCallTool).not.toHaveBeenCalled()
    })

    it('ignores a module whose MCP address is not a loaded MCP', async () => {
        state.db.modules.push({ id: 'broken', name: 'broken', description: '', mcp: { url: 'constructor' } })
        state.db.enabledModules.push('broken')

        expect(await getEnabledMCPs()).toEqual([])
    })
})
