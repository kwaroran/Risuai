import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RisuPlugin } from '../plugins.svelte'

const hostState = vi.hoisted(() => ({
    apiFactory: undefined as any,
}))

vi.mock('./factory', () => ({
    SandboxHost: class {
        constructor(apiFactory: any) {
            hostState.apiFactory = apiFactory
        }

        run() {}

        terminate() {}
    },
}))

vi.mock('src/ts/stores.svelte', async () => {
    const { writable } = await import('svelte/store')
    const store = <T>(value: T) => writable(value)
    return {
        SizeStore: store({ w: 0, h: 0 }),
        loadedStore: store(false),
        DynamicGUI: store(false),
        sideBarClosing: store(false),
        sideBarStore: store(false),
        selectedCharID: store(-1),
        CurrentTriggerIdStore: store(null),
        CharEmotion: store({}),
        ViewBoxsize: store({ width: 192, height: 192 }),
        settingsOpen: store(false),
        botMakerMode: store(false),
        moduleBackgroundEmbedding: store(''),
        openPresetList: store(false),
        openPersonaList: store(false),
        bookmarkListOpen: store(false),
        MobileGUI: store(false),
        MobileGUIStack: store(0),
        MobileSideBar: store(0),
        SettingsMenuIndex: store(-1),
        ReloadGUIPointer: store(0),
        ReloadChatPointer: store({}),
        ScrollToMessageStore: { value: -1 },
        OpenRealmStore: store(false),
        RealmInitialOpenChar: store(null),
        ShowRealmFrameStore: store(''),
        PlaygroundStore: store(0),
        HideIconStore: store(false),
        CustomCSSStore: store(''),
        SafeModeStore: store(false),
        MobileSearch: store(''),
        CharConfigSubMenu: store(0),
        CustomGUISettingMenuStore: store(false),
        alertStore: store({ type: 'none', msg: 'n' }),
        hypaV3ModalOpen: store(false),
        hypaV3ProgressStore: store({ open: false, miniMsg: '', msg: '', subMsg: '' }),
        selIdState: { selId: -1 },
        DBState: { db: {} },
        LoadingStatusState: { text: '' },
        QuickSettings: { open: false, index: 0 },
        pluginAlertModalStore: { open: false, errors: [] },
        disableHighlight: store(true),
        additionalSettingsMenu: [],
        additionalFloatingActionButtons: [],
        additionalHamburgerMenu: [],
        additionalChatMenu: [],
        chatPanelStore: [],
        bodyIntercepterStore: [],
        easyPanelStore: { open: false },
        popupStore: { open: false, children: null, mouseX: 0, mouseY: 0, openId: 0 },
        popUpEditorStore: { open: false, value: '', mode: 'default', language: 'markdown' },
        loadoutModalStore: { open: false },
        onboardingModalStore: { open: false },
        irisStore: { open: false },
        customSideBarConfigDialogStore: { open: false },
        hotReloading: [],
    }
})

vi.mock('src/ts/alert', async (importOriginal) => {
    const actual = await importOriginal<typeof import('src/ts/alert')>()
    return {
        ...actual,
        alertConfirm: vi.fn(async () => true),
    }
})

import { executePluginV3, getV3PluginInstance } from './v3.svelte'

const waitForMutationDelivery = () => new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
})

const plugin: RisuPlugin = {
    name: 'mutation-observer-regression',
    script: '',
    arguments: {},
    realArg: {},
    customLink: [],
    argMeta: {},
    version: '3.0',
}

const describeRecords = (records: any) => {
    const batch = []
    for(let i = 0; i < records.length(); i++){
        const record = records.at(i)
        const target = record.getTarget()
        const addedNodes = record.getAddedNodes()
        const removedNodes = record.getRemovedNodes()
        const describeNodes = (nodes: any) => {
            const described = []
            for(let j = 0; j < nodes.length(); j++){
                const node = nodes.at(j)
                described.push({
                    nodeName: node.nodeName(),
                    nodeType: node.nodeType(),
                    outerHTML: node.getOuterHTML(),
                })
            }
            return described
        }
        batch.push({
            type: record.getType(),
            target: {
                nodeName: target.nodeName(),
                nodeType: target.nodeType(),
                outerHTML: target.getOuterHTML(),
                innerHTML: target.getInnerHTML(),
                textContent: target.textContent(),
            },
            added: describeNodes(addedNodes),
            removed: describeNodes(removedNodes),
        })
    }
    return batch
}

describe('V3 SafeMutationObserver', () => {
    afterEach(() => {
        getV3PluginInstance(plugin.name)?.host.terminate()
        document.body.innerHTML = ''
    })

    it('normalizes text targets, preserves element targets, and drops only detached records', async () => {
        document.body.innerHTML = '<div id="mutation-root"><span id="text-parent">initial</span></div>'
        await executePluginV3(plugin)

        // The happy-dom iframe implementation does not execute srcdoc scripts. Capture the
        // API factory passed to the real V3 host so this test still uses the public observer API
        // without exporting SafeMutationObserver or changing the plugin surface.
        const apiFactory = hostState.apiFactory
        const rootDocument = await apiFactory.getRootDocument()
        const observedElement = rootDocument.querySelector('#mutation-root')
        const batches: any[] = []
        const observer = apiFactory.createMutationObserver((records: any) => {
            batches.push(describeRecords(records))
        })
        await observer.observe(observedElement, {
            characterData: true,
            childList: true,
            subtree: true,
        })

        const root = document.querySelector('#mutation-root') as HTMLElement
        const textParent = document.querySelector('#text-parent') as HTMLElement
        const textNode = textParent.firstChild as Text

        textNode.data = 'character-data-only'
        await waitForMutationDelivery()
        expect(batches[0]).toEqual([{
            type: 'characterData',
            target: {
                nodeName: 'SPAN',
                nodeType: 1,
                outerHTML: '<span id="text-parent">character-data-only</span>',
                innerHTML: 'character-data-only',
                textContent: 'character-data-only',
            },
            added: [],
            removed: [],
        }])

        textNode.data = 'mixed-character-data'
        const addedElement = document.createElement('b')
        addedElement.textContent = 'mixed-child'
        root.append(addedElement)
        await waitForMutationDelivery()
        expect(batches).toHaveLength(2)
        const mixedBatch = batches[1]

        expect(mixedBatch).toContainEqual({
            type: 'characterData',
            target: {
                nodeName: 'SPAN',
                nodeType: 1,
                outerHTML: '<span id="text-parent">mixed-character-data</span>',
                innerHTML: 'mixed-character-data',
                textContent: 'mixed-character-data',
            },
            added: [],
            removed: [],
        })
        expect(mixedBatch).toContainEqual({
            type: 'childList',
            target: {
                nodeName: 'DIV',
                nodeType: 1,
                outerHTML: '<div id="mutation-root" x-identifier=""><span id="text-parent">mixed-character-data</span><b>mixed-child</b></div>',
                innerHTML: '<span id="text-parent">mixed-character-data</span><b>mixed-child</b>',
                textContent: 'mixed-character-datamixed-child',
            },
            added: [{
                nodeName: 'B',
                nodeType: 1,
                outerHTML: '<b>mixed-child</b>',
            }],
            removed: [],
        })

        let deliverSyntheticMutations: ((mutations: MutationRecord[]) => void) | undefined
        class SyntheticMutationObserver {
            constructor(callback: (mutations: MutationRecord[]) => void) {
                deliverSyntheticMutations = callback
            }

            observe() {}

            disconnect() {}
        }

        const nativeMutationObserver = globalThis.MutationObserver
        globalThis.MutationObserver = SyntheticMutationObserver as unknown as typeof MutationObserver
        try {
            const detachedObserver = apiFactory.createMutationObserver((records: any) => {
                batches.push(describeRecords(records))
            })
            await detachedObserver.observe(observedElement, {
                characterData: true,
                childList: true,
                subtree: true,
            })

            const detachedText = document.createTextNode('detached-text-change')
            const emptyNodeList = [] as unknown as NodeList
            deliverSyntheticMutations?.([
                {
                    type: 'characterData',
                    target: detachedText,
                    addedNodes: emptyNodeList,
                    removedNodes: emptyNodeList,
                } as unknown as MutationRecord,
                {
                    type: 'childList',
                    target: root,
                    addedNodes: emptyNodeList,
                    removedNodes: emptyNodeList,
                } as unknown as MutationRecord,
            ])
        } finally {
            globalThis.MutationObserver = nativeMutationObserver
        }

        expect(batches).toHaveLength(3)
        const detachedBatch = batches[2]
        expect(detachedBatch).toHaveLength(1)
        expect(detachedBatch).toContainEqual({
            type: 'childList',
            target: {
                nodeName: 'DIV',
                nodeType: 1,
                outerHTML: '<div id="mutation-root" x-identifier=""><span id="text-parent">mixed-character-data</span><b>mixed-child</b></div>',
                innerHTML: '<span id="text-parent">mixed-character-data</span><b>mixed-child</b>',
                textContent: 'mixed-character-datamixed-child',
            },
            added: [],
            removed: [],
        })
    })
})
