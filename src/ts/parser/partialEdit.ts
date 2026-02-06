/**
 * 부분 수정 유틸리티
 * 
 * 렌더링된 HTML 블록에서 원본 마크다운의 해당 범위를 찾고,
 * 부분 수정 후 원본 텍스트를 업데이트하는 기능 제공
 */

/**
 * Confidence 값 비교 시 사용할 epsilon 임계값
 * 이 값보다 작은 차이는 무시하여 부동소수점 오차와 의미없는 미세 차이를 처리
 */
const CONFIDENCE_EPSILON = 0.001;

export interface RangeResult {
    start: number;
    end: number;
    method: 'exact' | 'anchor' | 'fuzzy' | 'fuzzy+eol' | 'fuzzy+eol+snap' | 'bigram';
    confidence: number; // 0~1 범위, 매칭 품질 (1 = perfect match)
}

export interface RangeResultWithContext extends RangeResult {
    lineNumber: number; // 매칭 위치의 대략적인 줄 번호 (1-based)
    contextBefore: string; // 매칭 앞의 컨텍스트 (N줄)
    contextAfter: string; // 매칭 뒤의 컨텍스트 (N줄)
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
    bigramThreshold?: number; // Bigram 유사도 임계값 (기본: 0.35)
    bigramMaxLen?: number; // Bigram 매칭 최대 길이 (기본: 2000)
    maxResults?: number; // 최대 결과 수 (기본: 10)
    minConfidence?: number; // 최소 confidence 임계값 (기본: 0.3)
    contextLines?: number; // 컨텍스트 줄 수 (기본: 2)
    contextMaxChars?: number; // 컨텍스트 최대 문자 수 (기본: 200)
}

/**
 * HTML 문자열에서 평문 텍스트 추출
 */
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
            // ellipsis 위치 매핑 개선: 각 점을 원본 위치에서 순차적으로 매핑
            const basePos = sourceMap[i];
            out.push('.', '.', '.');
            map.push(basePos, basePos, basePos + 1);
            i++;
            continue;
        }

        if (ch === ' ' || ch === '\t') {
            // 연속 공백 처리 개선: 첫 공백 위치 유지
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
 * Bigram 프로필 생성 (2-gram 빈도 맵)
 */
interface BigramProfile {
    counts: Map<number, number>;
    total: number; // bigram 총 개수 (length - 1)
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

/**
 * Dice coefficient를 사용한 Bigram 유사도 계산
 */
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

/**
 * Prefix/Suffix 매칭 스코어 계산
 */
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

/**
 * Prefix/Suffix와 Bigram Dice coefficient를 혼합한 유사도 계산
 */
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
 * 평문 텍스트에서 원본 마크다운의 모든 매칭 범위를 찾음
 * 
 * 드래그 선택된 텍스트나 HTML에서 추출된 텍스트를 기반으로
 * 원본 마크다운에서 해당하는 범위를 찾음
 * 
 * @param originalMd - 원본 마크다운 전체 문자열
 * @param plainText - 검색할 평문 텍스트 (선택된 텍스트 또는 HTML에서 추출한 텍스트)
 * @param opts - 옵션
 * @returns 찾은 모든 범위 (confidence 내림차순, 같으면 position 오름차순)
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

    // 정규화 + 인덱스 맵 생성
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
        // 같은 줄에 있는 매칭들을 그룹화하고 가장 높은 confidence만 유지
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

    // 1순위: 전체 일치 (최대 MAX_RESULTS개만 찾기)
    let searchPos = 0;
    while (results.length < MAX_RESULTS && searchPos <= mdN.length - plN.length) {
        const idx = mdN.indexOf(plN, searchPos);
        if (idx < 0) break;
        const range = mapBack(idx, idx + plN.length, 'exact', 1.0);
        results.push(addContext(range));
        searchPos = idx + plN.length; // 매칭된 부분 이후부터 검색 (중복 방지)
    }

    // Exact match가 있으면 다른 방법은 시도하지 않음
    if (results.length > 0) {
        // Confidence 내림차순, 같으면 position 오름차순
        results.sort((a, b) => {
            if (Math.abs(a.confidence - b.confidence) > CONFIDENCE_EPSILON) {
                return b.confidence - a.confidence;
            }
            return a.start - b.start;
        });
        // 같은 줄의 중복 제거
        const deduplicated = deduplicateByLine(results);
        return deduplicated.slice(0, MAX_RESULTS);
    }

    // 2순위: 앵커(head/tail) 일치 (최대 MAX_RESULTS개만 찾기)
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
                headPos = tailPos + N; // 매칭 끝 이후부터 검색 (중복 방지)
            } else {
                headPos = mdN.indexOf(head, headPos + 1); // 다음 head 찾기
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
        // 같은 줄의 중복 제거
        const deduplicated = deduplicateByLine(results);
        return deduplicated.slice(0, MAX_RESULTS);
    }

    // 3순위: fuzzy 매칭 (조기 종료 최적화)
    if (plN.length <= FUZZY_MAX) {
        const step = Math.max(1, Math.min(8, Math.floor(plN.length / 20)));
        const threshold = Math.max(5, Math.floor(plN.length * 0.15));
        const uniqueCandidates = new Map<number, number>();
        
        // 첫 번째 스캔: step 단위로 빠르게 검색
        for (let i = 0; i + plN.length <= mdN.length; i += step) {
            const seg = mdN.slice(i, i + plN.length);
            const d = fastEditDistance(plN, seg, CUTOFF);
            if (d <= threshold) {
                uniqueCandidates.set(i, d);
                
                // 고품질 결과를 충분히 찾으면 조기 종료
                const confidence = 1 - (d / threshold);
                if (confidence >= 0.9 && uniqueCandidates.size >= MAX_RESULTS) {
                    break;
                }
            }
        }

        // 세밀 재검색: 찾은 후보 주변만 정밀 검색 (중복 제거)
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

        // 결과 생성 (confidence 순으로 정렬하여 최대 MAX_RESULTS개만)
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
            
            // Overlap 체크: 30% 이상 겹치는 기존 결과가 있으면 추가하지 않음
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
        // 같은 줄의 중복 제거
        const deduplicated = deduplicateByLine(results);
        return deduplicated.slice(0, MAX_RESULTS);
    }

    // 4순위: Bigram 유사도 매칭 (조기 종료 최적화)
    if (plN.length > FUZZY_MAX || plN.length <= BIGRAM_MAX) {
        const step = Math.max(1, Math.floor(plN.length / 10));
        const uniqueCandidates = new Map<number, number>();

        // 첫 번째 스캔: step 단위로 빠르게 검색
        for (let i = 0; i + plN.length <= mdN.length; i += step) {
            const seg = mdN.slice(i, i + plN.length);
            const score = bigramSimilarity(plN, seg);
            if (score >= BIGRAM_THRESHOLD) {
                uniqueCandidates.set(i, score);
                
                // 고품질 결과를 충분히 찾으면 조기 종료
                if (score >= 0.9 && uniqueCandidates.size >= MAX_RESULTS) {
                    break;
                }
            }
        }

        // 세밀 재검색: 찾은 후보 주변만 정밀 검색 (중복 제거)
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

        // 결과 생성 (confidence 순으로 정렬하여 최대 MAX_RESULTS개만)
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
            
            // Overlap 체크: 30% 이상 겹치는 기존 결과가 있으면 추가하지 않음
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
    // 같은 줄의 중복 제거
    const deduplicated = deduplicateByLine(results);
    return deduplicated.slice(0, MAX_RESULTS);
}

/**
 * 렌더링된 HTML 블록에서 원본 마크다운의 모든 매칭 범위를 찾음
 * 
 * HTML을 평문으로 변환한 후 findAllOriginalRangesFromText에 위임
 * 
 * @param originalMd - 원본 마크다운 전체 문자열
 * @param replacedHtml - 정규식 치환 후 화면에 표시되는 HTML (해당 블록의 outerHTML 또는 innerHTML)
 * @param opts - 옵션
 * @returns 찾은 모든 범위 (confidence 내림차순, 같으면 position 오름차순)
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

/**
 * 원본 텍스트에서 지정된 범위를 새 텍스트로 교체
 */
export function replaceRange(original: string, range: RangeResult, newText: string): string {
    return original.slice(0, range.start) + newText + original.slice(range.end);
}

/**
 * 줄 번호 계산 (1-based)
 */
function calculateLineNumber(text: string, position: number): number {
    let line = 1;
    for (let i = 0; i < position && i < text.length; i++) {
        if (text[i] === '\n') line++;
    }
    return line;
}

/**
 * 매칭 위치 앞뒤 컨텍스트 추출
 * 
 * 빈 줄(공백/탭만 있는 줄)은 줄 수에 포함하지 않고,
 * 실제 내용이 있는 줄만 카운트하여 의미 있는 컨텍스트 제공
 */
function extractContext(
    text: string,
    start: number,
    end: number,
    linesBefore: number = 2,
    linesAfter: number = 2,
    maxChars: number = 200
): { before: string; after: string } {
    /**
     * 줄이 빈 줄인지 확인 (공백/탭만 있거나 비어있으면 빈 줄)
     */
    function isEmptyLine(lineContent: string): boolean {
        return lineContent.trim().length === 0;
    }

    // 앞 컨텍스트: 내용이 있는 줄을 linesBefore개 찾을 때까지 역방향 스캔
    let beforeStart = start;
    let contentLinesFound = 0;
    let currentLineStart = start;
    
    // start 위치에서 역방향으로 줄 단위로 스캔
    for (let i = start - 1; i >= 0; i--) {
        if (text[i] === '\n' || i === 0) {
            // 줄의 시작 위치 결정 (i === 0이면 0, 아니면 i + 1)
            const lineStart = i === 0 ? 0 : i + 1;
            const lineContent = text.slice(lineStart, currentLineStart);
            
            // 빈 줄이 아니면 카운트
            if (!isEmptyLine(lineContent)) {
                contentLinesFound++;
                if (contentLinesFound >= linesBefore) {
                    beforeStart = lineStart;
                    break;
                }
            }
            
            beforeStart = lineStart;
            currentLineStart = i; // 다음 줄의 끝 위치 (현재 \n 위치)
            
            if (i === 0) break;
        }
    }
    
    let before = text.slice(beforeStart, start).trim();
    if (before.length > maxChars) {
        before = '...' + before.slice(-maxChars);
    }

    // 뒤 컨텍스트: 내용이 있는 줄을 linesAfter개 찾을 때까지 정방향 스캔
    let afterEnd = end;
    contentLinesFound = 0;
    let currentLineEnd = end;
    
    // end 위치에서 정방향으로 줄 단위로 스캔
    for (let i = end; i <= text.length; i++) {
        if (text[i] === '\n' || i === text.length) {
            const lineContent = text.slice(currentLineEnd, i);
            
            // 빈 줄이 아니면 카운트
            if (!isEmptyLine(lineContent)) {
                contentLinesFound++;
                afterEnd = i;
                if (contentLinesFound >= linesAfter) {
                    break;
                }
            } else {
                // 빈 줄도 포함 (카운트는 안 하지만 추출 범위에는 포함)
                afterEnd = i;
            }
            
            currentLineEnd = i + 1; // 다음 줄의 시작 위치
            
            if (i === text.length) break;
        }
    }
    
    let after = text.slice(end, afterEnd).trim();
    if (after.length > maxChars) {
        after = after.slice(0, maxChars) + '...';
    }

    return { before, after };
}

/**
 * 부분 수정 대상이 되는 블록 요소 선택자
 */
export const EDITABLE_BLOCK_SELECTORS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p',
    'span',
    'ul', 'ol',
    'blockquote',
    'pre',
    'div',
];
