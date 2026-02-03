/**
 * 부분 수정 유틸리티
 * 
 * 렌더링된 HTML 블록에서 원본 마크다운의 해당 범위를 찾고,
 * 부분 수정 후 원본 텍스트를 업데이트하는 기능 제공
 */

export interface RangeResult {
    start: number;
    end: number;
    method: 'exact' | 'anchor' | 'fuzzy' | 'fuzzy+eol' | 'fuzzy+eol+snap';
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
    searchStartOffset?: number;
}

/**
 * HTML 문자열에서 평문 텍스트 추출
 */
export function htmlToPlain(htmlOrFragment: string | HTMLElement): string {
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

    // ruby 태그 처리: <ruby>베이스<rt>루비</rt></ruby> → "베이스(루비)"
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
 * Stage 1: CBS 패턴 변환
 * 
 * {{ruby::A::B}} → A(B) 형태로 변환하고, 각 문자가 원본의 어느 위치에서 왔는지 추적하는 맵 생성
 * 
 * @param s - 원본 문자열
 * @returns processed - 변환된 문자열, positionMap - 각 문자의 원본 위치
 * 
 * @example
 * Input:  "Hello {{ruby::漢字::かんじ}} world"
 * Output: { processed: "Hello 漢字(かんじ) world", positionMap: [0,1,2,3,4,5,6,6,7,8,9,10,...] }
 *          positionMap[6] = 6 (첫 문자는 {{ruby:: 포함)
 *          positionMap[14] = 23 (마지막 ')' 는 패턴 종료 직전)
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
        const baseText = match[1]; // A
        const rubyText = match[2]; // B

        // 매칭 이전의 일반 텍스트 추가
        for (let j = lastIndex; j < matchStart; j++) {
            processed += s[j];
            positionMap.push(j);
        }

        // 변환된 ruby 텍스트 추가 및 위치 맵핑
        // 'A' 부분 - 첫 문자는 {{ruby:: 포함한 시작 위치로 매핑
        const baseStart = matchStart + 8; // '{{ruby::' 길이
        for (let j = 0; j < baseText.length; j++) {
            processed += baseText[j];
            positionMap.push(j === 0 ? matchStart : baseStart + j);
        }
        
        processed += '(';
        positionMap.push(baseStart + baseText.length);
        
        // 'B' 부분 - '::' 이후 위치로 매핑
        const rubyStart = baseStart + baseText.length + 2; // '::' 길이
        for (let j = 0; j < rubyText.length; j++) {
            processed += rubyText[j];
            positionMap.push(rubyStart + j);
        }
        
        // ')' 괄호는 패턴 종료 직전 위치로 매핑하여 mapBack에서 end = matchEnd가 되도록 함
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
 * Stage 2: 텍스트 정규화
 * 
 * CRLF, 타이포그래픽 문자, 제로폭 문자, 공백 등을 정규화하고
 * sourceMap을 통해 최종 결과를 원본 문자열의 위치로 매핑
 * 
 * @param text - Stage 1에서 변환된 텍스트
 * @param sourceMap - Stage 1의 positionMap (text의 각 문자가 원본의 어느 위치인지)
 * @returns norm - 정규화된 문자열, map - 각 문자의 원본 위치
 * 
 * @example
 * Input:  text="Hello\r\nWorld", sourceMap=[0,1,2,3,4,5,6,7,8,9,10]
 * Output: { norm="Hello\nWorld", map=[0,1,2,3,4,5,7,8,9,10] }
 *         (CRLF → LF로 변환, 위치는 sourceMap[5]를 사용)
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
        '\u3000': ' ', // 전각 공백
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
            out.push('.', '.', '.');
            map.push(sourceMap[i], sourceMap[i], sourceMap[i]);
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
 * 문자열 정규화 및 인덱스 맵 생성 (2단계 파이프라인)
 * 
 * 변환 파이프라인:
 * 1. Stage 1 (transformCBSPatterns): {{ruby::A::B}} → A(B) 변환 + positionMap 생성
 * 2. Stage 2 (normalizeText): 타이포그래픽 정규화 + 최종 map 생성
 * 
 * 이중 맵핑 인디렉션:
 *   최종 map[i]는 sourceMap을 통해 원본 위치를 참조
 *   map[i] = positionMap[processedIndex] = originalIndex
 * 
 * @example
 * Input:  "{{ruby::漢字::かんじ}}\r\ntest"
 * Stage 1: "漢字(かんじ)\r\ntest" + positionMap
 * Stage 2: "漢字(かんじ)\ntest" + map (최종적으로 원본 위치 참조)
 */
function normalizeWithMap(s: string): { norm: string; map: number[] } {
    const stage1 = transformCBSPatterns(s);
    return normalizeText(stage1.processed, stage1.positionMap);
}

/**
 * 빠른 편집 거리 계산 (가지치기 포함)
 */
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

/**
 * 렌더링된 HTML 블록에서 원본 마크다운의 해당 범위를 찾음
 * 
 * @param originalMd - 원본 마크다운 전체 문자열
 * @param replacedHtml - 정규식 치환 후 화면에 표시되는 HTML (해당 블록의 outerHTML 또는 innerHTML)
 * @param opts - 옵션
 * @returns 찾은 범위 또는 null
 */
export function findOriginalRangeFromHtml(
    originalMd: string,
    replacedHtml: string | HTMLElement,
    opts: FindRangeOptions = {}
): RangeResult | null {
    const ANCH = opts.anchor ?? 12;
    const FUZZY_MAX = opts.fuzzyMaxLen ?? 200;
    const CUTOFF = opts.fuzzyCutoff ?? 20;
    const EXTEND_EOL = !!opts.extendToEOL;
    const EXTEND_MAX = opts.extendMax ?? 5000;
    const SNAP_BOL = !!opts.snapStartToPrevEOL;
    const SNAP_BACK = opts.snapMaxBack ?? 4;
    const SNAP_TRIM = opts.snapTrimSpaces ?? true;
    const SEARCH_START = opts.searchStartOffset ?? 0;

    // HTML → 평문
    const plain = htmlToPlain(replacedHtml);
    if (!plain) return null;

    // 정규화 + 인덱스 맵 생성
    const { norm: mdN, map: mdMap } = normalizeWithMap(originalMd);
    const { norm: plN } = normalizeWithMap(plain);

    function mapBack(nStart: number, nEnd: number, method: RangeResult['method'] = 'exact'): RangeResult {
        const start = mdMap[nStart];
        const end = nEnd - 1 < mdMap.length ? mdMap[nEnd - 1] + 1 : originalMd.length;
        return { start, end, method };
    }

    // 1순위: 전체 일치
    let idx = mdN.indexOf(plN, SEARCH_START);
    if (idx >= 0) {
        return mapBack(idx, idx + plN.length);
    }

    // 2순위: 앵커(head/tail) 일치
    const N = Math.max(8, Math.min(ANCH, Math.floor(plN.length / 3)));
    if (plN.length >= N * 2) {
        const head = plN.slice(0, N);
        const tail = plN.slice(-N);
        const headPos = mdN.indexOf(head, SEARCH_START);
        if (headPos >= 0) {
            const tailPos = mdN.indexOf(tail, headPos + head.length);
            if (tailPos >= 0) {
                return mapBack(headPos, tailPos + N, 'anchor');
            }
        }
    }

    // 3순위: fuzzy 매칭
    if (plN.length <= FUZZY_MAX) {
        let best = { pos: -1, dist: Infinity };
        const step = 8;
        for (let i = SEARCH_START; i + plN.length <= mdN.length; i += step) {
            const seg = mdN.slice(i, i + plN.length);
            const d = fastEditDistance(plN, seg, CUTOFF);
            if (d < best.dist) {
                best = { pos: i, dist: d };
                if (d === 0) break;
            }
        }
        if (best.pos >= 0 && best.dist <= Math.max(5, Math.floor(plN.length * 0.15))) {
            let nStart = best.pos;
            let nEnd = best.pos + plN.length;

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

            return mapBack(
                nStart,
                nEnd,
                EXTEND_EOL ? (SNAP_BOL ? 'fuzzy+eol+snap' : 'fuzzy+eol') : 'fuzzy'
            );
        }
    }

    return null;
}

/**
 * 원본 텍스트에서 지정된 범위를 새 텍스트로 교체
 */
export function replaceRange(original: string, range: RangeResult, newText: string): string {
    return original.slice(0, range.start) + newText + original.slice(range.end);
}

/**
 * 부분 수정 대상이 되는 블록 요소 선택자
 */
export const EDITABLE_BLOCK_SELECTORS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p',
    'ul', 'ol',
    'blockquote',
    'pre',
    'div.x-risu-regex-quote-block',
    'div.x-risu-regex-thought-block',
    'div.x-risu-regex-sound-block',
    'div.x-risu-message',
];
