/**
 * Epsilon threshold for confidence comparison
 * Ignores differences smaller than this value to handle floating-point errors
 */
const CONFIDENCE_EPSILON = 0.001;

export interface RangeResult {
    start: number;
    end: number;
    method: 'exact' | 'anchor' | 'fuzzy' | 'fuzzy+eol' | 'fuzzy+eol+snap' | 'bigram';
    confidence: number;
}

export interface RangeResultWithContext extends RangeResult {
    lineNumber: number;
    contextBefore: string;
    contextAfter: string;
}

export interface FindRangeOptions {
    anchor?: number;
    fuzzyMaxLen?: number;
    fuzzyCutoff?: number;
    extendToEOL?: boolean;
    extendMax?: number;
    snapStartToPrevEOL?: boolean;
    snapMaxBack?: number;
    snapTrimSpaces?: boolean;
    bigramThreshold?: number;
    bigramMaxLen?: number;
    maxResults?: number;
    minConfidence?: number;
    contextLines?: number;
    contextMaxChars?: number;
}

function htmlToPlain(htmlOrFragment: string | HTMLElement): string {
    let html = '';
    if (typeof htmlOrFragment === 'string') {
        html = htmlOrFragment;
    } else if (htmlOrFragment?.outerHTML) {
        html = htmlOrFragment.outerHTML;
    } else if (htmlOrFragment?.innerHTML) {
        html = htmlOrFragment.innerHTML;
    } else {
        return '';
    }

    const div = document.createElement('div');
    div.innerHTML = html;

    // Convert ruby tags: <ruby>base<rt>ruby</rt></ruby> → "base(ruby)"
    div.querySelectorAll('ruby').forEach((rb) => {
        const base = rb.cloneNode(true) as HTMLElement;
        base.querySelectorAll('rt, rp').forEach((n) => n.remove());
        const rt = rb.querySelector('rt')?.textContent || '';
        const text = `${base.textContent || ''}${rt ? `(${rt})` : ''}`;
        rb.replaceWith(document.createTextNode(text));
    });

    return div.textContent || '';
}

/**
 * Stage 1: Transform CBS patterns {{ruby::A::B}} → A(B) with position map
 * Maps each character back to its original position in input string
 */
/**
 * @example
 * Input:  "Hello {{ruby::漢字::かんじ}} world"
 * Output: { processed: "Hello 漢字(かんじ) world", positionMap: [0,1,2,3,4,5,6,6,7,8,9,10,...] }
 */
function transformCBSPatterns(s: string): { processed: string; positionMap: number[] } {
    let processed = '';
    const positionMap: number[] = [];
    const rubyRegex = /\{\{ruby::([^:}]+)::([^}]+)\}\}/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rubyRegex.exec(s)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        const baseText = match[1];
        const rubyText = match[2];

        for (let j = lastIndex; j < matchStart; j++) {
            processed += s[j];
            positionMap.push(j);
        }

        const baseStart = matchStart + 8;
        for (let j = 0; j < baseText.length; j++) {
            processed += baseText[j];
            positionMap.push(j === 0 ? matchStart : baseStart + j);
        }
        
        processed += '(';
        positionMap.push(baseStart + baseText.length);
        
        const rubyStart = baseStart + baseText.length + 2;
        for (let j = 0; j < rubyText.length; j++) {
            processed += rubyText[j];
            positionMap.push(rubyStart + j);
        }
        
        processed += ')';
        positionMap.push(matchEnd - 1);

        lastIndex = matchEnd;
    }

    for (let j = lastIndex; j < s.length; j++) {
        processed += s[j];
        positionMap.push(j);
    }

    return { processed, positionMap };
}

/**
 * Stage 2: Normalize text (CRLF, typographic chars, zero-width chars, whitespace)
 * Maps final result back to original string positions via sourceMap
 */
function normalizeText(text: string, sourceMap: number[]): { norm: string; map: number[] } {
    const out: string[] = [];
    const map: number[] = [];
    let i = 0;
    const len = text.length;

    const typomap: Record<string, string> = {
        '\u2018': "'", // '
        '\u2019': "'", // '
        '\u201C': '"', // "
        '\u201D': '"', // "
        '\u2013': '-', // –
        '\u2014': '-', // —
        '\u3000': ' ',
    };

    while (i < len) {
        const ch = text[i];

        if (ch === '\r') {
            const next = text[i + 1];
            out.push('\n');
            map.push(sourceMap[i]);
            i += next === '\n' ? 2 : 1;
            continue;
        }

        if ((ch >= '\u200B' && ch <= '\u200D') || ch === '\uFEFF') {
            i++;
            continue;
        }

        if (ch === '\u00A0') {
            out.push(' ');
            map.push(sourceMap[i]);
            i++;
            continue;
        }

        if (typomap[ch]) {
            out.push(typomap[ch]);
            map.push(sourceMap[i]);
            i++;
            continue;
        }

        if (ch === '\u2026') {
            const basePos = sourceMap[i];
            out.push('.', '.', '.');
            map.push(basePos, basePos, basePos + 1);
            i++;
            continue;
        }

        if (ch === ' ' || ch === '\t') {

            if (out.length > 0 && out[out.length - 1] === ' ') {
                i++;
                continue;
            }
            out.push(' ');
            map.push(sourceMap[i]);
            i++;
            continue;
        }

        out.push(ch);
        map.push(sourceMap[i]);
        i++;
    }

    while (out.length && out[0] === ' ') {
        out.shift();
        map.shift();
    }
    while (out.length && out[out.length - 1] === ' ') {
        out.pop();
        map.pop();
    }

    return { norm: out.join(''), map };
}

/**
 * Two-stage normalization pipeline:
 * 1. Stage 1: Transform CBS patterns + create positionMap
 * 2. Stage 2: Normalize text + create final map to original positions
 */
function normalizeWithMap(s: string): { norm: string; map: number[] } {
    const stage1 = transformCBSPatterns(s);
    return normalizeText(stage1.processed, stage1.positionMap);
}

// Fast edit distance with pruning
function fastEditDistance(a: string, b: string, cutoff: number = 30): number {
    const n = a.length;
    const m = b.length;
    if (Math.abs(n - m) > cutoff) return cutoff + 1;

    const dp = new Array(m + 1);
    for (let j = 0; j <= m; j++) dp[j] = j;

    for (let i = 1; i <= n; i++) {
        let prev = dp[0];
        dp[0] = i;
        let rowMin = dp[0];
        for (let j = 1; j <= m; j++) {
            const tmp = dp[j];
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
            prev = tmp;
            if (dp[j] < rowMin) rowMin = dp[j];
        }
        if (rowMin > cutoff) return cutoff + 1;
    }
    return dp[m];
}

interface BigramProfile {
    counts: Map<number, number>;
    total: number;
}

function buildBigramProfile(s: string): BigramProfile {
    const counts = new Map<number, number>();
    const len = s.length;

    for (let i = 0; i < len - 1; i++) {
        const k = (s.charCodeAt(i) << 16) | s.charCodeAt(i + 1);
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    return { counts, total: Math.max(0, len - 1) };
}

// Bigram similarity using Dice coefficient
function diceFromProfiles(a: BigramProfile, b: BigramProfile): number {
    if (a.total === 0 || b.total === 0) return 0;

    let small = a, large = b;
    if (a.counts.size > b.counts.size) {
        small = b;
        large = a;
    }

    let inter = 0;
    for (const [k, ca] of small.counts) {
        const cb = large.counts.get(k);
        if (cb) inter += Math.min(ca, cb);
    }

    return (2 * inter) / (a.total + b.total);
}

// Prefix/Suffix matching score
function prefixSuffixScore(a: string, b: string): number {
    const la = a.length;
    const lb = b.length;
    const minLen = Math.min(la, lb);
    if (!minLen) return la === lb ? 1 : 0;

    let prefix = 0;
    while (prefix < minLen && a.charCodeAt(prefix) === b.charCodeAt(prefix)) prefix++;

    let suffix = 0;
    while (suffix + prefix < minLen && a.charCodeAt(la - 1 - suffix) === b.charCodeAt(lb - 1 - suffix)) {
        suffix++;
    }

    const maxLen = Math.max(la, lb);
    const edgeMatchCount = prefix + suffix;
    const sMax = edgeMatchCount / maxLen;
    const sMin = edgeMatchCount / minLen;
    const lengthRatio = minLen / maxLen;
    const boosted = sMax + (sMin - sMax) * lengthRatio;
    return boosted;
}

// Blended similarity: Prefix/Suffix + Bigram Dice coefficient
const PS_WEIGHT = 0.4;
const DICE_WEIGHT = 0.6;

function bigramSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;

    const ps = prefixSuffixScore(a, b);
    const profileA = buildBigramProfile(a);
    const profileB = buildBigramProfile(b);
    const dice = diceFromProfiles(profileA, profileB);

    return PS_WEIGHT * ps + DICE_WEIGHT * dice;
}





/**
 * Find all matching ranges in original markdown for given plain text
 * Tries multiple strategies: exact, anchor, fuzzy, and bigram matching
 */
export function findAllOriginalRangesFromText(
    originalMd: string,
    plainText: string,
    opts: FindRangeOptions = {}
): RangeResultWithContext[] {
    const MAX_RESULTS = opts.maxResults ?? 10;
    const MIN_CONFIDENCE = opts.minConfidence ?? 0.3;
    const CONTEXT_LINES = opts.contextLines ?? 1;
    const CONTEXT_MAX_CHARS = opts.contextMaxChars ?? 200;
    const ANCH = opts.anchor ?? 12;
    const FUZZY_MAX = opts.fuzzyMaxLen ?? 500;
    const CUTOFF = opts.fuzzyCutoff ?? 20;
    const EXTEND_EOL = !!opts.extendToEOL;
    const EXTEND_MAX = opts.extendMax ?? 5000;
    const SNAP_BOL = !!opts.snapStartToPrevEOL;
    const SNAP_BACK = opts.snapMaxBack ?? 4;
    const SNAP_TRIM = opts.snapTrimSpaces ?? true;
    const BIGRAM_THRESHOLD = opts.bigramThreshold ?? 0.35;
    const BIGRAM_MAX = opts.bigramMaxLen ?? 2000;

    if (!plainText) return [];

    const { norm: mdN, map: mdMap } = normalizeWithMap(originalMd);
    const { norm: plN } = normalizeWithMap(plainText);

    function mapBack(nStart: number, nEnd: number, method: RangeResult['method'], confidence: number): RangeResult {
        const start = mdMap[nStart];
        const end = nEnd - 1 < mdMap.length ? mdMap[nEnd - 1] + 1 : originalMd.length;
        return { start, end, method, confidence };
    }

    function addContext(range: RangeResult): RangeResultWithContext {
        const lineNumber = calculateLineNumber(originalMd, range.start);
        const context = extractContext(originalMd, range.start, range.end, CONTEXT_LINES, CONTEXT_LINES, CONTEXT_MAX_CHARS);
        return {
            ...range,
            lineNumber,
            contextBefore: context.before,
            contextAfter: context.after,
        };
    }

    function deduplicateByLine(matches: RangeResultWithContext[]): RangeResultWithContext[] {
        // Keep only highest confidence match per line
        const byLine = new Map<number, RangeResultWithContext>();
        for (const match of matches) {
            const existing = byLine.get(match.lineNumber);
            if (!existing || match.confidence > existing.confidence) {
                byLine.set(match.lineNumber, match);
            }
        }
        return Array.from(byLine.values());
    }

    const results: RangeResultWithContext[] = [];

    // Stage 1: Exact match
    let searchPos = 0;
    while (results.length < MAX_RESULTS && searchPos <= mdN.length - plN.length) {
        const idx = mdN.indexOf(plN, searchPos);
        if (idx < 0) break;
        const range = mapBack(idx, idx + plN.length, 'exact', 1.0);
        results.push(addContext(range));
        searchPos = idx + plN.length;
    }

    if (results.length > 0) {
        // Sort by confidence descending, then position ascending
        results.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) > CONFIDENCE_EPSILON) {
                return b.confidence - a.confidence;
            }
            return a.start - b.start;
        });
        const deduplicated = deduplicateByLine(results);
        return deduplicated.slice(0, MAX_RESULTS);
    }

    // Stage 2: Anchor (head/tail) matching
    const N = Math.max(8, Math.min(ANCH, Math.floor(plN.length / 3)));
    if (plN.length >= N * 2) {
        const head = plN.slice(0, N);
        const tail = plN.slice(-N);
        
        let headPos = 0;
        while (results.length < MAX_RESULTS && (headPos = mdN.indexOf(head, headPos)) >= 0) {
            const tailPos = mdN.indexOf(tail, headPos + head.length);
            if (tailPos >= 0) {
                const matchedLen = N * 2;
                const confidence = Math.min(0.95, 0.7 + (matchedLen / plN.length) * 0.25);
                if (confidence >= MIN_CONFIDENCE) {
                    const range = mapBack(headPos, tailPos + N, 'anchor', confidence);
                    results.push(addContext(range));
                }
                headPos = tailPos + N;
            } else {
                headPos = mdN.indexOf(head, headPos + 1);
                if (headPos < 0) break;
            }
        }
    }

    if (results.length > 0) {
        results.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) > CONFIDENCE_EPSILON) {
                return b.confidence - a.confidence;
            }
            return a.start - b.start;
        });
        const deduplicated = deduplicateByLine(results);
        return deduplicated.slice(0, MAX_RESULTS);
    }

    // Stage 3: Fuzzy matching
    if (plN.length <= FUZZY_MAX) {
        const step = Math.max(1, Math.min(8, Math.floor(plN.length / 20)));
        const threshold = Math.max(5, Math.floor(plN.length * 0.15));
        const uniqueCandidates = new Map<number, number>();
        
        for (let i = 0; i + plN.length <= mdN.length; i += step) {
            const seg = mdN.slice(i, i + plN.length);
            const d = fastEditDistance(plN, seg, CUTOFF);
            if (d <= threshold) {
                uniqueCandidates.set(i, d);
                
                const confidence = 1 - (d / threshold);
                if (confidence >= 0.9 && uniqueCandidates.size >= MAX_RESULTS) {
                    break;
                }
            }
        }

        const refinedPositions = new Set<number>();
        for (const [candPos, candDist] of Array.from(uniqueCandidates.entries())) {
            const refineStart = Math.max(0, candPos - Math.floor(step / 2));
            const refineEnd = Math.min(mdN.length - plN.length, candPos + Math.floor(step / 2));
            
            for (let i = refineStart; i <= refineEnd; i++) {
                if (refinedPositions.has(i) || uniqueCandidates.has(i)) continue;
                refinedPositions.add(i);
                
                const seg = mdN.slice(i, i + plN.length);
                const d = fastEditDistance(plN, seg, CUTOFF);
                if (d <= threshold) {
                    const existing = uniqueCandidates.get(i);
                    if (!existing || d < existing) {
                        uniqueCandidates.set(i, d);
                    }
                }
            }
        }

        const sortedCandidates = Array.from(uniqueCandidates.entries())
            .map(([pos, dist]) => ({
                pos,
                dist,
                confidence: Math.max(0, 1 - (dist / threshold))
            }))
            .filter(c => c.confidence >= MIN_CONFIDENCE)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, MAX_RESULTS);

        for (const { pos, confidence } of sortedCandidates) {
            let nStart = pos;
            let nEnd = pos + plN.length;

            if (EXTEND_EOL) {
                const nl = mdN.indexOf('\n', nEnd);
                const hardCapEnd = Math.min(mdN.length, nEnd + EXTEND_MAX);
                nEnd = nl === -1 ? hardCapEnd : Math.min(nl, hardCapEnd);

                if (SNAP_BOL) {
                    const scanStart = Math.max(0, nStart - SNAP_BACK);
                    const local = mdN.slice(scanStart, nStart);
                    const nlLocalIdx = local.lastIndexOf('\n');
                    if (nlLocalIdx !== -1) {
                        let s = scanStart + nlLocalIdx + 1;
                        if (SNAP_TRIM) {
                            while (s < nStart && (mdN[s] === ' ' || mdN[s] === '\t')) s++;
                        }
                        if (s < nEnd) nStart = s;
                    }
                }
            }

            const method = EXTEND_EOL ? (SNAP_BOL ? 'fuzzy+eol+snap' : 'fuzzy+eol') : 'fuzzy';
            const range = mapBack(nStart, nEnd, method, confidence);
            
            const hasOverlap = results.some(existing => 
                Math.abs(existing.start - range.start) < plN.length * 0.3
            );
            if (!hasOverlap) {
                results.push(addContext(range));
            }
        }
    }

    if (results.length > 0) {
        results.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) > CONFIDENCE_EPSILON) {
                return b.confidence - a.confidence;
            }
            return a.start - b.start;
        });
        const deduplicated = deduplicateByLine(results);
        return deduplicated.slice(0, MAX_RESULTS);
    }

    // Stage 4: Bigram similarity matching
    if (plN.length > FUZZY_MAX || plN.length <= BIGRAM_MAX) {
        const step = Math.max(1, Math.floor(plN.length / 10));
        const uniqueCandidates = new Map<number, number>();

        for (let i = 0; i + plN.length <= mdN.length; i += step) {
            const seg = mdN.slice(i, i + plN.length);
            const score = bigramSimilarity(plN, seg);
            if (score >= BIGRAM_THRESHOLD) {
                uniqueCandidates.set(i, score);
                
                if (score >= 0.9 && uniqueCandidates.size >= MAX_RESULTS) {
                    break;
                }
            }
        }

        const refinedPositions = new Set<number>();
        for (const [candPos] of Array.from(uniqueCandidates.entries())) {
            const refineStart = Math.max(0, candPos - Math.floor(step / 2));
            const refineEnd = Math.min(mdN.length - plN.length, candPos + Math.floor(step / 2));
            
            for (let i = refineStart; i <= refineEnd; i++) {
                if (refinedPositions.has(i) || uniqueCandidates.has(i)) continue;
                refinedPositions.add(i);
                
                const seg = mdN.slice(i, i + plN.length);
                const score = bigramSimilarity(plN, seg);
                if (score >= BIGRAM_THRESHOLD) {
                    const existing = uniqueCandidates.get(i);
                    if (!existing || score > existing) {
                        uniqueCandidates.set(i, score);
                    }
                }
            }
        }

        const sortedCandidates = Array.from(uniqueCandidates.entries())
            .map(([pos, score]) => ({ pos, score }))
            .filter(c => c.score >= MIN_CONFIDENCE)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS);

        for (const { pos, score } of sortedCandidates) {
            let nStart = pos;
            let nEnd = pos + plN.length;

            if (EXTEND_EOL) {
                const nl = mdN.indexOf('\n', nEnd);
                const hardCapEnd = Math.min(mdN.length, nEnd + EXTEND_MAX);
                nEnd = nl === -1 ? hardCapEnd : Math.min(nl, hardCapEnd);

                if (SNAP_BOL) {
                    const scanStart = Math.max(0, nStart - SNAP_BACK);
                    const local = mdN.slice(scanStart, nStart);
                    const nlLocalIdx = local.lastIndexOf('\n');
                    if (nlLocalIdx !== -1) {
                        let s = scanStart + nlLocalIdx + 1;
                        if (SNAP_TRIM) {
                            while (s < nStart && (mdN[s] === ' ' || mdN[s] === '\t')) s++;
                        }
                        if (s < nEnd) nStart = s;
                    }
                }
            }

            const range = mapBack(nStart, nEnd, 'bigram', score);
            
            const hasOverlap = results.some(existing => 
                Math.abs(existing.start - range.start) < plN.length * 0.3
            );
            if (!hasOverlap) {
                results.push(addContext(range));
            }
        }
    }

    results.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) > CONFIDENCE_EPSILON) {
            return b.confidence - a.confidence;
        }
        return a.start - b.start;
    });
    const deduplicated = deduplicateByLine(results);
    return deduplicated.slice(0, MAX_RESULTS);
}

/**
 * Find all matching ranges for rendered HTML block
 * Converts HTML to plain text, then delegates to findAllOriginalRangesFromText
 */
export function findAllOriginalRangesFromHtml(
    originalMd: string,
    replacedHtml: string | HTMLElement,
    opts: FindRangeOptions = {}
): RangeResultWithContext[] {
    const plain = htmlToPlain(replacedHtml);
    if (!plain) return [];
    return findAllOriginalRangesFromText(originalMd, plain, opts);
}

export function replaceRange(original: string, range: RangeResult, newText: string): string {
    return original.slice(0, range.start) + newText + original.slice(range.end);
}

function calculateLineNumber(text: string, position: number): number {
    let line = 1;
    for (let i = 0; i < position && i < text.length; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}

/**
 * Extract context before/after match position
 * Empty lines are skipped; only lines with content are counted
 */
function extractContext(
    text: string,
    start: number,
    end: number,
    linesBefore: number = 2,
    linesAfter: number = 2,
    maxChars: number = 200
): { before: string; after: string } {
    function isEmptyLine(lineContent: string): boolean {
        return lineContent.trim().length === 0;
    }

    let beforeStart = start;
    let contentLinesFound = 0;
    let currentLineStart = start;
    
    for (let i = start - 1; i >= 0; i--) {
        if (text[i] === '\n' || i === 0) {
            const lineStart = i === 0 ? 0 : i + 1;
            const lineContent = text.slice(lineStart, currentLineStart);
            
            if (!isEmptyLine(lineContent)) {
                contentLinesFound++;
                if (contentLinesFound >= linesBefore) {
                    beforeStart = lineStart;
                    break;
                }
            }
            
            beforeStart = lineStart;
            currentLineStart = i;
            
            if (i === 0) break;
        }
    }
    
    let before = text.slice(beforeStart, start).trim();
    if (before.length > maxChars) {
        before = '...' + before.slice(-maxChars);
    }

    let afterEnd = end;
    contentLinesFound = 0;
    let currentLineEnd = end;
    
    for (let i = end; i <= text.length; i++) {
        if (text[i] === '\n' || i === text.length) {
            const lineContent = text.slice(currentLineEnd, i);
            
            if (!isEmptyLine(lineContent)) {
                contentLinesFound++;
                afterEnd = i;
                if (contentLinesFound >= linesAfter) {
                    break;
                }
            } else {
                afterEnd = i;
            }
            
            currentLineEnd = i + 1;
            
            if (i === text.length) break;
        }
    }
    
    let after = text.slice(end, afterEnd).trim();
    if (after.length > maxChars) {
        after = after.slice(0, maxChars) + '...';
    }

    return { before, after };
}

export const EDITABLE_BLOCK_SELECTORS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p',
    'span',
    'ul', 'ol',
    'blockquote',
    'pre',
    'div',
];
