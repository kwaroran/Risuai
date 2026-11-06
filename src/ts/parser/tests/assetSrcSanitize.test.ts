// @vitest-environment jsdom
// DOMPurify does not support happy-dom. Since 3.4.8 it reads tag names through
// the Node.prototype.nodeName getter, which returns '' on happy-dom elements, so
// every element is stripped (https://github.com/capricorn86/happy-dom/issues/2182).
import { describe, it, expect, vi } from 'vitest'
import { writable } from 'svelte/store'
import { ParseMarkdown, trimMarkdown } from '../parser.svelte'

// jsdom has no matchMedia, which platform.ts calls at import time
vi.hoisted(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query })) as any
})

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
            chats: [{}],
            defaultVariables: '',
          },
        ],
        globalChatVariables: {},
        templateDefaultVariables: '',
      },
    },
    selIdState: {
      selId: 0,
    },
    selectedCharID: writable(0),
  } as typeof import('../../stores.svelte')
})

//#endregion

// On desktop (Tauri) getFileSrc resolves local assets to an asset: URL via
// convertFileSrc (globalApi.svelte.ts getFileSrc). DOMPurify must not strip
// the src of such images while keeping the path in alt, which renders every
// {{img::}}/{{image::}}/{{asset::}}/{{emotion::}} asset as broken text.
const assetUrl =
  'asset://localhost/Users/test/Library/Application%20Support/co.aiclient.risu/assets/pic.png'

describe('asset: image src sanitization', () => {
  it('keeps the src of an img whose URL uses the asset: scheme', () => {
    const out = trimMarkdown(`<img src="${assetUrl}" alt="${assetUrl}">`)
    expect(out).toContain(`src="${assetUrl}"`)
  })

  it('keeps the asset: src through the ParseMarkdown chat entry point', async () => {
    const out = await ParseMarkdown(`<img src="${assetUrl}" alt="${assetUrl}">`, null, 'back')
    expect(out).toContain(`src="${assetUrl}"`)
  })
})
