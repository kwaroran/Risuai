import type { RisuModule } from 'src/ts/process/modules'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addEnabledMCPModuleIfMissing, callMCPTool, getMCPTools } from './mcp'
import { registeredCustomPluginMCPs, registerMCPModule, unregisterMCPModule } from './pluginmcp'

const db = vi.hoisted(() => ({
    modules: [] as RisuModule[],
    enabledModules: [] as string[],
}))

vi.mock(import('localforage'), () => ({
    default: { createInstance: () => ({}) },
} as unknown as typeof import('localforage')))

vi.mock(import('src/ts/storage/database.svelte'), () => ({
    getDatabase: () => db,
} as unknown as typeof import('src/ts/storage/database.svelte')))

vi.mock(import('src/ts/stores.svelte'), () => ({
    DBState: { db },
} as unknown as typeof import('src/ts/stores.svelte')))

vi.mock(import('../modules'), () => ({
    getModuleMcps: () => db.modules
        .filter((module) => db.enabledModules.includes(module.id))
        .map((module) => module.mcp?.url)
        .filter((url) => url),
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
    return {
        RisuAccessClient: class extends MCPClientLike {
            constructor() {
                super('internal:risuai')
            }
        },
    } as unknown as typeof import('./risuaccess')
})

const identifier = 'plugin:tools'

const register = (owner: string, toolName: string) => {
    const callTool = vi.fn(async () => [{ type: 'text' as const, text: `${toolName} result` }])
    registerMCPModule(
        owner,
        { identifier, name: 'Tools', version: '1.0.0', description: 'Test tools' },
        async () => [{ name: toolName, description: '', inputSchema: {} }],
        callTool,
    )
    return callTool
}

const enableModule = () => {
    db.modules.push({ id: 'module', name: 'Tools', description: '', mcp: { url: identifier } })
    db.enabledModules.push('module')
}

const toolNames = async () => (await getMCPTools()).map((tool) => tool.name)

beforeEach(() => {
    registeredCustomPluginMCPs.clear()
    db.modules = []
    db.enabledModules = []
})

describe('plugin MCP ownership', () => {
    it.each([
        ['an identifier without the plugin: prefix', { identifier: 'internal:fs' }],
        ['an identifier that is not a plain string', { identifier: new String('plugin:tools') as unknown as string }],
        ['an identifier that spans several lines', { identifier: 'plugin:tools\nand more' }],
        ['a missing name', { name: undefined as unknown as string }],
        ['an empty name', { name: '' }],
    ])('rejects %s', (_, info) => {
        expect(() => registerMCPModule(
            'owner',
            { identifier, name: 'Tools', version: '1.0.0', description: '', ...info },
            async () => [],
            async () => [],
        )).toThrow()
        expect(registeredCustomPluginMCPs.size).toBe(0)
    })

    it('keeps another plugin from replacing a registered identifier', () => {
        register('owner', 'owned')
        const ownerClient = registeredCustomPluginMCPs.get(identifier)

        expect(() => register('other', 'hijacked')).toThrow()
        expect(registeredCustomPluginMCPs.get(identifier)).toBe(ownerClient)
    })

    it('keeps another plugin from unregistering a registered identifier', () => {
        register('owner', 'owned')

        unregisterMCPModule('other', identifier)

        expect(registeredCustomPluginMCPs.has(identifier)).toBe(true)
    })

    it('lets the owner unregister its identifier, freeing it for another plugin', () => {
        register('owner', 'owned')

        unregisterMCPModule('owner', identifier)
        register('other', 'next')

        expect(registeredCustomPluginMCPs.get(identifier)?.owner).toBe('other')
    })
})

describe('plugin MCP tools', () => {
    it('serves the latest registration after the owner registers again', async () => {
        enableModule()
        const firstCallTool = register('owner', 'first')
        expect(await toolNames()).toEqual(['first'])

        const secondCallTool = register('owner', 'second')

        expect(await toolNames()).toEqual(['second'])
        expect(await callMCPTool('second', {})).toEqual([{ type: 'text', text: 'second result' }])
        expect(secondCallTool).toHaveBeenCalledOnce()
        expect(firstCallTool).not.toHaveBeenCalled()
    })

    it('stops serving tools once the MCP is unregistered', async () => {
        enableModule()
        const callTool = register('owner', 'first')
        expect(await toolNames()).toEqual(['first'])

        unregisterMCPModule('owner', identifier)

        expect(await toolNames()).toEqual([])
        await callMCPTool('first', {})
        expect(callTool).not.toHaveBeenCalled()
    })

    it('does not serve a registered MCP whose module is not enabled', async () => {
        register('owner', 'first')

        expect(await toolNames()).toEqual([])
    })
})

describe('addEnabledMCPModuleIfMissing', () => {
    it('adds an enabled module that makes the registered MCP available', async () => {
        register('owner', 'first')
        const client = registeredCustomPluginMCPs.get(identifier)!

        addEnabledMCPModuleIfMissing(identifier, client.serverInfo)

        expect(db.modules).toHaveLength(1)
        expect(db.modules[0].mcp).toEqual({ url: identifier })
        expect(db.enabledModules).toEqual([db.modules[0].id])
        expect(await toolNames()).toEqual(['first'])
    })

    it('leaves an existing module as the user left it', () => {
        register('owner', 'first')
        const client = registeredCustomPluginMCPs.get(identifier)!
        db.modules.push({ id: 'module', name: 'Tools', description: '', mcp: { url: identifier } })

        addEnabledMCPModuleIfMissing(identifier, client.serverInfo)

        expect(db.modules).toHaveLength(1)
        expect(db.enabledModules).toEqual([])
    })
})
