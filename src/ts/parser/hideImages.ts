import css, { type CssAtRuleAST } from '@adobe/css-tools'

/**
 * Shown in place of chat images while hideAllImages is on. Parsing emits this
 * path, and applyHiddenImageTheme swaps it for a copy drawn in the current
 * color scheme at render time. The file itself is a neutral fallback.
 */
export const hiddenImageSrc = '/hidden-image.svg'
const hiddenImageCssUrl = `url("${hiddenImageSrc}")`

export type HiddenImageColors = {
    darkbg?: string
    darkBorderc?: string
    textcolor2?: string
}

// default color scheme, used when the database has none yet
const fallbackColors: Required<HiddenImageColors> = {
    darkbg: '#21222c',
    darkBorderc: '#4b5563',
    textcolor2: '#64748b',
}

// Custom schemes are free text, so only plain color values reach the SVG
const safeColorRegex = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/]+\))$/i

function pickColor(value:unknown, fallback:string){
    return typeof value === 'string' && safeColorRegex.test(value.trim()) ? value.trim() : fallback
}

// lucide image-off
const hiddenImageIcon = '<line x1="2" y1="2" x2="22" y2="22"/>'
    + '<path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/>'
    + '<line x1="13.5" y1="13.5" x2="6" y2="21"/>'
    + '<line x1="18" y1="12" x2="21" y2="15"/>'
    + '<path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/>'
    + '<path d="M21 15V5a2 2 0 0 0-2-2H9"/>'

export function renderHiddenImageSvg(colors?:HiddenImageColors){
    const bg = pickColor(colors?.darkbg, fallbackColors.darkbg)
    const border = pickColor(colors?.darkBorderc, fallbackColors.darkBorderc)
    const icon = pickColor(colors?.textcolor2, fallbackColors.textcolor2)
    // No size and no viewBox: the browser lays the SVG out at whatever box it is
    // drawn into instead of scaling it, so the frame fills portrait and landscape
    // boxes alike while the icon keeps its size at the center. Media queries
    // inside an SVG image match that box, which shrinks the icon in small ones.
    return '<svg xmlns="http://www.w3.org/2000/svg">'
        + '<style>'
        + 'rect{x:1px;y:1px;width:calc(100% - 2px);height:calc(100% - 2px)}'
        + '.i{transform:translate(-20px,-20px) scale(1.6667)}'
        + '@media (max-width:120px),(max-height:90px){.i{transform:translate(-10px,-10px) scale(.8333)}}'
        + '@media (max-width:36px),(max-height:28px){.i{display:none}}'
        + '</style>'
        + `<rect width="100%" height="100%" rx="10" fill="${bg}" fill-opacity="0.7" stroke="${border}" stroke-width="2" stroke-dasharray="8 6"/>`
        + '<svg x="50%" y="50%" overflow="visible">'
        + `<g class="i" fill="none" stroke="${icon}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${hiddenImageIcon}</g>`
        + '</svg>'
        + '</svg>'
}

let cachedSvg = ''
let cachedDataUri = ''

export function hiddenImageDataUri(colors?:HiddenImageColors){
    const svg = renderHiddenImageSvg(colors)
    if(svg !== cachedSvg){
        cachedSvg = svg
        // encodeURIComponent leaves no quotes, '<' or '&', so the result is
        // safe to drop into attributes and <style> text of serialized HTML
        cachedDataUri = 'data:image/svg+xml,' + encodeURIComponent(svg)
    }
    return cachedDataUri
}

// 1x1 transparent gif used as a spacer, not real content
const transparentGifPrefix = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP'

const imageFunctionRegex = /(?<![\w-])(?:url|(?:-webkit-)?image-set)\(/gi

/** Index of the ')' closing a function whose arguments start at `start`, or -1. */
function findClosingParen(text:string, start:number){
    let depth = 1
    let quote = ''
    for(let i = start; i < text.length; i++){
        const c = text[i]
        if(c === '\\'){
            i++
            continue
        }
        if(quote){
            if(c === quote){
                quote = ''
            }
            continue
        }
        if(c === '"' || c === "'"){
            quote = c
        }
        else if(c === '('){
            depth++
        }
        else if(c === ')' && --depth === 0){
            return i
        }
    }
    return -1
}

/** Transparent spacer gifs are layout helpers, not content worth hiding. */
export function isSpacerImage(src:string){
    return src.trim().startsWith(transparentGifPrefix)
}

function isHiddenImageExempt(src:string){
    src = src.trim()
    return src === ''
        || src.startsWith('#')
        || src === hiddenImageSrc
        || isSpacerImage(src)
}

/**
 * Replaces every image reference in a CSS value with the hidden image
 * placeholder. Fragment references (url(#id)) point at in-document SVG
 * gradients, masks and filters rather than images, so they are kept.
 */
export function hideCssImageUrls(value:string){
    if(!value || !/url\(|image-set\(/i.test(value)){
        return value
    }
    const regex = new RegExp(imageFunctionRegex)
    let out = ''
    let last = 0
    let match:RegExpExecArray | null
    while((match = regex.exec(value))){
        const open = match.index + match[0].length
        let close = findClosingParen(value, open)
        if(close === -1){
            // CSS closes an unterminated function at the end of input
            close = value.length
        }
        regex.lastIndex = close + 1
        if(match[0].toLowerCase() === 'url('){
            const arg = value.slice(open, close).trim().replace(/^(['"])(.*)\1$/s, '$2')
            if(isHiddenImageExempt(arg)){
                continue
            }
        }
        out += value.slice(last, match.index) + hiddenImageCssUrl
        last = close + 1
    }
    return out + value.slice(last)
}

/** Points every url() in `cssText` that references the placeholder at `uri`. */
function themeCssHiddenImages(cssText:string, uri:string){
    const regex = /(?<![\w-])url\(/gi
    let out = ''
    let last = 0
    let match:RegExpExecArray | null
    while((match = regex.exec(cssText))){
        const open = match.index + match[0].length
        let close = findClosingParen(cssText, open)
        if(close === -1){
            close = cssText.length
        }
        regex.lastIndex = close + 1
        const arg = cssText.slice(open, close).trim().replace(/^(['"])(.*)\1$/s, '$2').trim()
        if(arg !== hiddenImageSrc){
            continue
        }
        out += cssText.slice(last, match.index) + `url("${uri}")`
        last = close + 1
    }
    return out + cssText.slice(last)
}

// attributes hideAttributeImage, hideElementImages and asset parsing point at the placeholder
const hiddenImageAttributes = new Set(['src', 'poster', 'background'])
const hiddenImageHrefTags = new Set(['image', 'feimage'])

/**
 * Swaps placeholder references under `root` for a copy drawn in `colors`.
 * Works on the DOM, so only image attributes, style attributes and <style>
 * text are touched; text and links that merely mention the path stay as they
 * are. Display-only: the data URI is large and follows the color scheme, so
 * it must stay out of anything stored or compared, like translation cache keys.
 */
export function applyHiddenImageTheme(root:ParentNode, colors?:HiddenImageColors){
    let uri = ''
    const getUri = () => uri ||= hiddenImageDataUri(colors)
    for(const el of Array.from(root.querySelectorAll('*'))){
        const tag = el.localName.toLowerCase()
        if(tag === 'style'){
            const text = el.textContent ?? ''
            if(text.includes(hiddenImageSrc)){
                el.textContent = themeCssHiddenImages(text, getUri())
            }
            continue
        }
        for(const attr of Array.from(el.attributes)){
            if(!attr.value.includes(hiddenImageSrc)){
                continue
            }
            const name = attr.name.toLowerCase()
            if(name === 'style'){
                attr.value = themeCssHiddenImages(attr.value, getUri())
            }
            else if(attr.value.trim() === hiddenImageSrc && (
                hiddenImageAttributes.has(name)
                || ((name === 'href' || name === 'xlink:href') && hiddenImageHrefTags.has(tag))
            )){
                attr.value = getUri()
            }
        }
    }
}

type CssWalkNode = {
    type: string
    property?: string
    value?: string
    declarations?: CssWalkNode[]
    rules?: CssWalkNode[]
    keyframes?: CssWalkNode[]
}

/** Hides image urls in a parsed rule and everything nested under it. */
export function hideStyleRuleImages(rule:CssAtRuleAST){
    walkRule(rule as CssWalkNode)
}

function walkRule(rule:CssWalkNode){
    // fonts and imported sheets are not images
    if(rule.type === 'font-face' || rule.type === 'import'){
        return
    }
    for(const decl of rule.declarations ?? []){
        if(decl.type === 'declaration' && decl.value && decl.property?.toLowerCase() !== 'cursor'){
            decl.value = hideCssImageUrls(decl.value)
        }
    }
    for(const child of rule.rules ?? []){
        walkRule(child)
    }
    for(const child of rule.keyframes ?? []){
        walkRule(child)
    }
}

/** Hides image urls in a whole stylesheet text, e.g. a raw <style> body. */
export function hideStyleSheetImages(text:string){
    if(!text || !/url\(|image-set\(/i.test(text)){
        return text
    }
    try {
        const ast = css.parse(text)
        for(const rule of ast.stylesheet.rules){
            hideStyleRuleImages(rule)
        }
        return css.stringify(ast, { indent: '', compress: true })
    } catch {
        // Unparsable CSS is still applied by the browser as far as it can be,
        // so fall back to replacing urls outright, outside fonts and imports.
        return hideUnparsedStyleSheetImages(text)
    }
}

/**
 * If a CSS string, comment or unquoted url() token starts at `i`, returns the
 * index just past it, otherwise -1. Follows the CSS tokenizer where it matters
 * for the scans below: an unquoted url ends only at ')', so quotes, braces and
 * '/*' inside it mean nothing, and a string ends at an unescaped newline. A
 * stray character therefore cannot shift the scan out of step with what the
 * browser reads.
 */
function skipCssToken(text:string, i:number){
    const c = text[i]
    if(c === '"' || c === "'"){
        for(let j = i + 1; j < text.length; j++){
            const d = text[j]
            if(d === '\\'){
                j++
            }
            else if(d === c){
                return j + 1
            }
            else if(d === '\n' || d === '\r' || d === '\f'){
                return j
            }
        }
        return text.length
    }
    if(c === '/' && text[i + 1] === '*'){
        const end = text.indexOf('*/', i + 2)
        return end === -1 ? text.length : end + 2
    }
    if((c === 'u' || c === 'U') && /^url\(/i.test(text.slice(i, i + 4)) && !/[\w-]/.test(text[i - 1] ?? '')){
        let j = i + 4
        while(j < text.length && /\s/.test(text[j])){
            j++
        }
        if(text[j] === '"' || text[j] === "'"){
            // url("...") is a function with a string argument, scanned as usual
            return -1
        }
        for(; j < text.length; j++){
            if(text[j] === '\\'){
                j++
            }
            else if(text[j] === ')'){
                return j + 1
            }
        }
        return text.length
    }
    return -1
}

/**
 * Index just past the at-rule whose prelude starts at `start`: past its ';'
 * for statements like @import, past its closing '}' for blocks like
 * @font-face, or at the '}' of an enclosing block. Braces and ';' inside
 * parentheses belong to that parenthesized block, as in the CSS parser. CSS
 * closes whatever is left open at the end of input, so an unterminated rule
 * runs to the end, and the browser reads all of it as part of that rule too.
 */
function findAtRuleEnd(text:string, start:number){
    let braces = 0
    let parens = 0
    for(let i = start; i < text.length; i++){
        const c = text[i]
        if(c === '\\'){
            i++
            continue
        }
        const next = skipCssToken(text, i)
        if(next !== -1){
            i = next - 1
            continue
        }
        if(c === '('){
            parens++
        }
        else if(c === ')'){
            parens = Math.max(0, parens - 1)
        }
        else if(parens > 0){
            continue
        }
        else if(c === '{'){
            braces++
        }
        else if(c === '}'){
            if(braces === 0){
                return i
            }
            if(--braces === 0){
                return i + 1
            }
        }
        else if(c === ';' && braces === 0){
            return i + 1
        }
    }
    return text.length
}

const preservedAtRuleRegex = /^@(?:import|font-face)(?![\w-])/i

/**
 * hideCssImageUrls over a stylesheet css.parse rejected, keeping @import and
 * @font-face rules as they are, the same way the parsed path does. At-rules
 * are only recognized outside strings, comments and urls, so a quoted
 * "@import" cannot shield the urls after it.
 */
function hideUnparsedStyleSheetImages(text:string){
    let out = ''
    let last = 0
    for(let i = 0; i < text.length; i++){
        const c = text[i]
        if(c === '\\'){
            i++
            continue
        }
        const next = skipCssToken(text, i)
        if(next !== -1){
            i = next - 1
            continue
        }
        if(c === '@'){
            const match = preservedAtRuleRegex.exec(text.slice(i, i + 11))
            if(match){
                const end = findAtRuleEnd(text, i + match[0].length)
                out += hideCssImageUrls(text.slice(last, i)) + text.slice(i, end)
                last = end
                i = end - 1
            }
        }
    }
    return out + hideCssImageUrls(text.slice(last))
}
