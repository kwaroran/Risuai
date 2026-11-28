// @vitest-environment jsdom
// DOMPurify 3.4.8+ strips every element on happy-dom, see assetSrcSanitize.test.ts
import { describe, it, expect, vi } from 'vitest'
import { writable } from 'svelte/store'
import { ParseMarkdown, trimMarkdown } from '../parser.svelte'

// jsdom has no matchMedia, which platform.ts calls at import time
vi.hoisted(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query })) as any
})

import { applyHiddenImageTheme, hiddenImageDataUri, hiddenImageSrc, hideCssImageUrls, hideStyleSheetImages, renderHiddenImageSvg } from '../hideImages'
import { DBState } from '../../stores.svelte'

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
        hideAllImages: true,
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

// The explicit <body> keeps a leading <style> in the body, as in trimMarkdownStyle.test.ts
const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}`, 'text/html').body
const placeholderUrl = `url("${hiddenImageSrc}")`
const leaked = 'https://example.com/leak.png'

describe('hideCssImageUrls', () => {
    it('replaces quoted, unquoted and nested urls', () => {
        expect(hideCssImageUrls(`background:url(${leaked}) center/cover`)).toBe(`background:${placeholderUrl} center/cover`)
        expect(hideCssImageUrls(`background-image:linear-gradient(red, blue), url('a(1).png')`)).toBe(`background-image:linear-gradient(red, blue), ${placeholderUrl}`)
        expect(hideCssImageUrls(`content:URL("data:image/png;base64,AAAA")`)).toBe(`content:${placeholderUrl}`)
    })

    it('replaces image-set as a whole', () => {
        expect(hideCssImageUrls(`background-image:-webkit-image-set("a.png" 1x, url(b.png) 2x)`)).toBe(`background-image:${placeholderUrl}`)
    })

    it('keeps fragment references', () => {
        expect(hideCssImageUrls('fill:url(#grad)')).toBe('fill:url(#grad)')
    })
})

describe('hideStyleSheetImages', () => {
    it('leaves fonts and cursors alone', () => {
        const out = hideStyleSheetImages(`@font-face{font-family:x;src:url(x.woff2)}.a{cursor:url(c.png),auto;background:url(${leaked})}`)
        expect(out).toContain('url(x.woff2)')
        expect(out).toContain('url(c.png)')
        expect(out).not.toContain(leaked)
    })

    it('keeps fonts and imports when the sheet does not parse', () => {
        // the missing '}' makes css.parse throw, so the text fallback runs
        const out = hideStyleSheetImages(`@import url("a.css");@font-face{font-family:x;src:url(x.woff2)}.a{background:url(${leaked})`)
        expect(out).toContain('@import url("a.css");')
        expect(out).toContain('src:url(x.woff2)')
        expect(out).not.toContain(leaked)
    })

    it('does not let braces, quotes or comments inside an unquoted url shield urls in the fallback', () => {
        const preludes = ['@import url(a{.css);', '@import url(a"b.css);', '@import url(a/*.css);', '@font-face{src:url(a}b.woff)}']
        for(const prelude of preludes){
            const out = hideStyleSheetImages(`${prelude}.a{background:url(${leaked})}.b{content:"}";color:blue`)
            expect(out.startsWith(prelude)).toBe(true)
            expect(out).not.toContain(leaked)
        }
    })

    it('does not let a quoted @import shield urls in the fallback', () => {
        const out = hideStyleSheetImages(`.a{content:"@import";background:url(${leaked})`)
        expect(out).toContain('content:"@import"')
        expect(out).not.toContain(leaked)
    })

    it('reaches into nested at-rules and keyframes', () => {
        const out = hideStyleSheetImages(`@media (min-width:1px){.a{background:url(${leaked})}}@keyframes k{from{background:url(${leaked})}}`)
        expect(out).not.toContain(leaked)
    })
})

describe('ParseMarkdown with hideAllImages', () => {
    const render = async (input: string) => parse(await ParseMarkdown(input, null, 'back'))

    it('replaces img sources and drops srcset', async () => {
        const body = await render(`<img src="${leaked}" srcset="${leaked} 2x">`)
        const img = body.querySelector('img')
        expect(img.getAttribute('src')).toBe(hiddenImageDataUri())
        expect(img.hasAttribute('srcset')).toBe(false)
        expect(img.hasAttribute('data-risu-hidden-image')).toBe(true)
    })

    it('drops picture sources that would override the img', async () => {
        const body = await render(`<picture><source srcset="${leaked}"><img src="${leaked}"></picture>`)
        expect(body.innerHTML).not.toContain(leaked)
    })

    it('replaces inline style urls', async () => {
        const body = await render(`<div style="background: #000 url('${leaked}') no-repeat;"></div>`)
        expect(body.innerHTML).not.toContain(leaked)
        expect(body.querySelector('div').getAttribute('style')).toContain(hiddenImageDataUri())
    })

    it('replaces urls in <style> blocks', async () => {
        const body = await render(`<style>.card { background-image: url("${leaked}"); }</style><div class="card"></div>`)
        expect(body.querySelector('style').textContent).toContain(hiddenImageDataUri())
        expect(body.innerHTML).not.toContain(leaked)
    })

    it('replaces urls in <style> blocks with attributes', async () => {
        const body = await render(`<style type="text/css">.card { background: url(${leaked}); }</style>`)
        expect(body.innerHTML).not.toContain(leaked)
    })

    it('keeps the plain placeholder path in pretranslate output', async () => {
        // pretranslate output is the translation input and cache key
        const out = await ParseMarkdown(`<img src="${leaked}">`, null, 'pretranslate')
        expect(parse(out).querySelector('img').getAttribute('src')).toBe(hiddenImageSrc)
        expect(out).not.toContain('data:image/svg+xml')
        // the display pass themes it
        expect(parse(trimMarkdown(out)).querySelector('img').getAttribute('src')).toBe(hiddenImageDataUri())
    })

    it('replaces svg images and video posters', async () => {
        const body = await render(`<svg><image href="${leaked}" width="10" height="10"></image></svg><video poster="${leaked}"></video>`)
        expect(body.innerHTML).not.toContain(leaked)
    })
})

describe('hidden image theming', () => {
    it('preserves caller-specific sanitizer attributes while applying the theme', () => {
        const out = trimMarkdown(
            `<button risu-change-var-name="route" risu-change-var-value="a">A</button><img src="${leaked}">`,
            {
                ADD_TAGS: [],
                ADD_ATTR: ['risu-change-var-name', 'risu-change-var-value'],
            },
        )
        const body = parse(out)
        const button = body.querySelector('button')
        expect(button.getAttribute('risu-change-var-name')).toBe('route')
        expect(button.getAttribute('risu-change-var-value')).toBe('a')
        expect(body.querySelector('img').getAttribute('src')).toBe(hiddenImageDataUri())
    })

    it('draws the placeholder in the given scheme colors', () => {
        const svg = renderHiddenImageSvg({ darkbg: '#123456', darkBorderc: 'rgb(1, 2, 3)', textcolor2: 'red' })
        expect(svg).toContain('fill="#123456"')
        expect(svg).toContain('stroke="rgb(1, 2, 3)"')
        expect(svg).toContain('stroke="red"')
    })

    it('falls back on values that are not plain colors', () => {
        const svg = renderHiddenImageSvg({ darkbg: '"/><script>alert(1)</script>' })
        expect(svg).not.toContain('script')
        expect(svg).toContain('fill="#21222c"')
    })

    it('leaves links and text that only contain the path alone', () => {
        const cases = [
            `<a href="https://cdn.example${hiddenImageSrc}">https://cdn.example${hiddenImageSrc}</a>`,
            `<p>${hiddenImageSrc}</p>`,
            `<p>url("${hiddenImageSrc}") src="${hiddenImageSrc}"</p>`,
            `<a href="https://x.example/?image=&quot;${hiddenImageSrc}&quot;">x</a>`,
        ]
        for(const html of cases){
            const out = trimMarkdown(html)
            expect(out).not.toContain('data:image/svg+xml')
            expect(parse(out).innerHTML).toBe(parse(trimMarkdown(html, undefined, { themeHiddenImages: false })).innerHTML)
        }
    })

    it('themes every css url form that references the placeholder', () => {
        const forms = [
            `url('${hiddenImageSrc}')`,
            `url(${hiddenImageSrc})`,
            `URL( "${hiddenImageSrc}" )`,
        ]
        for(const form of forms){
            const attr = form.replaceAll('"', '&quot;')
            const body = parse(trimMarkdown(`<div style="background:${attr}"></div><style>.a{background:${form}}</style>`))
            expect(body.querySelector('div').getAttribute('style')).toContain(hiddenImageDataUri())
            expect(body.querySelector('style').textContent).toContain(hiddenImageDataUri())
            expect(body.innerHTML).not.toContain(`${hiddenImageSrc}`)
        }
    })

    it('does not theme anything while hideAllImages is off', () => {
        DBState.db.hideAllImages = false
        try {
            const out = trimMarkdown(`<p>${hiddenImageSrc}</p><img src="${hiddenImageSrc}">`)
            expect(out).not.toContain('data:image/svg+xml')
            const body = parse(out)
            expect(body.querySelector('p').textContent).toBe(hiddenImageSrc)
            expect(body.querySelector('img').getAttribute('src')).toBe(hiddenImageSrc)
        } finally {
            DBState.db.hideAllImages = true
        }
    })

    it('swaps the placeholder in image attributes, style attributes and style text', () => {
        const root = parse(`<img src="${hiddenImageSrc}"><video poster="${hiddenImageSrc}"></video><svg><image href="${hiddenImageSrc}"></image></svg><div style="background:url(&quot;${hiddenImageSrc}&quot;)"></div><style>.a{background:url("${hiddenImageSrc}")}</style>`)
        applyHiddenImageTheme(root, { darkbg: '#abcdef' })
        expect(root.innerHTML).not.toContain(hiddenImageSrc)
        const src = root.querySelector('img').getAttribute('src')
        expect(src.startsWith('data:image/svg+xml,')).toBe(true)
        expect(decodeURIComponent(src)).toContain('#abcdef')
        expect(root.querySelector('video').getAttribute('poster')).toBe(src)
        expect(root.querySelector('image').getAttribute('href')).toBe(src)
        expect(root.querySelector('div').getAttribute('style')).toContain(src)
        expect(root.querySelector('style').textContent).toContain(src)
    })
})
