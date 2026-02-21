# RisuAI CBS Mode for CodeMirror 5

**CodeMirror 5 syntax highlighting mode for RisuAI CBS (Character Book Script)**

CBS는 RisuAI에서 캐릭터 카드, 로어북, 프롬프트 등에 사용되는 템플릿 스크립팅 언어입니다.

---

## 목차

1. [설치 및 사용](#설치-및-사용)
2. [CBS 문법 개요](#cbs-문법-개요)
3. [토큰 타입 및 CSS 클래스](#토큰-타입-및-css-클래스)
4. [모드 옵션](#모드-옵션)
5. [오버레이 및 혼합 모드](#오버레이-및-혼합-모드)
6. [자동완성 (Hint)](#자동완성-hint)
7. [CBS 함수 레퍼런스](#cbs-함수-레퍼런스)
8. [예제](#예제)

---

## 설치 및 사용

### CDN 사용

```html
<!-- CodeMirror 5 CDN -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/codemirror.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/codemirror.min.js"></script>

<!-- RisuAI CBS Mode -->
<script src="risuai-cbs-mode.js"></script>

<script>
  var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "risuai-cbs",
    lineNumbers: true
  });
</script>
```

### NPM / CommonJS

```javascript
var CodeMirror = require("codemirror");
require("./risuai-cbs-mode");

var editor = CodeMirror(document.body, {
  mode: "risuai-cbs"
});
```

### AMD (RequireJS)

```javascript
require(["codemirror", "risuai-cbs-mode"], function(CodeMirror) {
  var editor = CodeMirror(document.body, { mode: "risuai-cbs" });
});
```

---

## CBS 문법 개요

### 기본 구문

CBS 표현식은 이중 중괄호로 감싸며, 인자는 `::`로 구분합니다.

```
{{함수명}}
{{함수명::인자1}}
{{함수명::인자1::인자2::인자3}}
```

### 블록 구문

블록은 `#`으로 시작하고 `{{/}}`로 닫습니다.

```
{{#when::조건}}
  내용
{{/}}

{{#when::A::is::B}}
  일치할 때
{{:else}}
  불일치할 때
{{/}}

{{#each [1, 2, 3] as item}}
  {{slot::item}}
{{/}}
```

### 주석

```
{{//::이것은 주석입니다}}
{{comment::이것도 주석입니다}}
```

### 이스케이프

```
{{bo}} → {  (여는 중괄호)
{{bc}} → }  (닫는 중괄호)
{{br}} → 줄바꿈
{{(}}  → (
{{)}}  → )
```

---

## 토큰 타입 및 CSS 클래스

이 모드는 CodeMirror 표준 토큰 타입과 CBS 전용 CSS 클래스를 모두 부여합니다.

### 브래킷

| 요소 | CM 토큰 | CBS 클래스 |
|------|---------|-----------|
| `{{` 여는 괄호 | `bracket` | `cm-cbs-bracket-open` |
| `}}` 닫는 괄호 | `bracket` | `cm-cbs-bracket-close` |
| `::` 구분자 | `punctuation` | `cm-cbs-separator` |

### 블록 구조

| 요소 | CM 토큰 | CBS 클래스 |
|------|---------|-----------|
| `#when`, `#each` 등 | `keyword` | `cm-cbs-block-keyword` |
| `{{/}}` 블록 닫기 | `keyword` | `cm-cbs-block-close-tag` |
| `{{:else}}` | `keyword` | `cm-cbs-else-keyword` |

### 함수 카테고리별 토큰

| 카테고리 | CM 토큰 | CBS 클래스 | 예시 |
|---------|---------|-----------|------|
| 캐릭터/사용자 | `variable-2` | `cm-cbs-function-char` | `char`, `user`, `personality` |
| 채팅 히스토리 | `variable-2` | `cm-cbs-function-chat` | `lastmessage`, `history` |
| 변수 조작 | `def` | `cm-cbs-function-mutating` | `setvar`, `addvar` |
| 변수 읽기 | `def` | `cm-cbs-function-var` | `getvar`, `tempvar` |
| 문자열 함수 | `string-2` | `cm-cbs-function-string` | `replace`, `trim`, `lower` |
| 숫자 함수 | `number` | `cm-cbs-function-numeric` | `calc`, `round`, `floor` |
| 배열/객체 함수 | `variable-3` | `cm-cbs-function-array` | `arraypush`, `element` |
| 논리 함수 | `operator` | `cm-cbs-function-logic` | `equal`, `and`, `or` |
| 날짜/시간 | `atom` | `cm-cbs-function-date` | `time`, `date`, `unixtime` |
| 랜덤 함수 | `atom` | `cm-cbs-function-random` | `random`, `pick`, `roll` |
| 에셋/표시 | `tag` | `cm-cbs-function-asset` | `image`, `audio`, `bg` |
| 프롬프트 | `qualifier` | `cm-cbs-function-prompt` | `mainprompt`, `jb` |
| 메타데이터 | `meta` | `cm-cbs-function-metadata` | `metadata` |
| 상태 | `property` | `cm-cbs-function-state` | `chatindex`, `role` |
| 암호화 | `string-2` | `cm-cbs-function-crypto` | `xor`, `tohex` |
| 집계 함수 | `number` | `cm-cbs-function-aggregate` | `min`, `max`, `sum` |
| 특수 함수 | `builtin` | `cm-cbs-function-special` | `return`, `button`, `slot` |
| 이스케이프 | `atom` | `cm-cbs-function-escape` | `bo`, `bc`, `br` |
| 미확인 함수 | `variable` | `cm-cbs-function-unknown` | 사용자 정의 함수 |

### 인자 토큰

| 요소 | CM 토큰 | CBS 클래스 |
|------|---------|-----------|
| 문자열 인자 | `string` | `cm-cbs-arg-string` |
| 숫자 인자 | `number` | `cm-cbs-arg-number` |
| 불리언 | `atom` | `cm-cbs-arg-boolean` |
| 주사위 표기 | `atom` | `cm-cbs-arg-dice` |
| JSON 배열/객체 | `string` | `cm-cbs-arg-json` |
| 변수명 인자 | `def`/`variable-2` | `cm-cbs-arg-varname` |
| 에셋명 인자 | `tag` | `cm-cbs-arg-asset` |
| 메타데이터 키 | `atom` | `cm-cbs-metadata-key` |
| 중첩 참조 `[[var]]` | `variable-2` | `cm-cbs-nested-ref` |
| `#when` 연산자 | `keyword` | `cm-cbs-when-operator` |
| `#when` 값 | `string` | `cm-cbs-when-value` |
| 일반 텍스트 | — | `cm-cbs-plaintext` |

### 주석

| 요소 | CM 토큰 | CBS 클래스 |
|------|---------|-----------|
| `//`, `comment` 키워드 | `comment` | `cm-cbs-comment-keyword` |
| 주석 텍스트 | `comment` | `cm-cbs-comment-text` |

---

## 모드 옵션

### 등록된 MIME 타입

| MIME | 모드 | 설명 |
|------|------|------|
| `text/x-risuai-cbs` | `risuai-cbs` | CBS 전용 모드 |
| `text/risuai-cbs` | `risuai-cbs` | 별칭 |
| `text/x-risuai-cbs-markdown` | `risuai-cbs-markdown` | CBS + Markdown 혼합 |

---

## 오버레이 및 혼합 모드

### CBS + Markdown 혼합 모드

마크다운 텍스트 안에 CBS 표현식을 사용하는 경우:

```javascript
var editor = CodeMirror(document.body, {
  mode: "risuai-cbs-markdown"
});
```

마크다운 문법과 CBS 문법이 동시에 하이라이팅됩니다.

> **주의**: `risuai-cbs-markdown` 모드를 사용하려면 CodeMirror의 `overlay.js` 애드온과 `markdown` 모드가 필요합니다.

### 커스텀 오버레이

다른 모드 위에 CBS를 오버레이할 수도 있습니다:

```javascript
// HTML + CBS
CodeMirror.defineMode("html+cbs", function(config) {
  return CodeMirror.overlayMode(
    CodeMirror.getMode(config, "htmlmixed"),
    CodeMirror.getMode(config, "risuai-cbs-overlay")
  );
});
```

---

## 자동완성 (Hint)

CBS 모드는 CodeMirror의 hint 애드온과 연동됩니다.

### 설정

```html
<!-- hint 애드온 로드 -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/addon/hint/show-hint.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.18/addon/hint/show-hint.js"></script>

<script>
  var editor = CodeMirror.fromTextArea(document.getElementById("code"), {
    mode: "risuai-cbs",
    extraKeys: {
      "Ctrl-Space": function(cm) {
        CodeMirror.showHint(cm, CodeMirror.hint["risuai-cbs"]);
      }
    }
  });
</script>
```

`{{`를 입력한 후 `Ctrl+Space`를 누르면 사용 가능한 CBS 함수 목록이 표시됩니다.

---

## CBS 함수 레퍼런스

### 캐릭터 & 사용자

| 함수 | 구문 | 설명 |
|------|------|------|
| `char` / `bot` | `{{char}}` | 캐릭터 이름 |
| `user` | `{{user}}` | 사용자 이름 |
| `personality` / `charpersona` | `{{personality}}` | 캐릭터 성격 |
| `description` / `chardesc` | `{{description}}` | 캐릭터 설명 |
| `scenario` | `{{scenario}}` | 시나리오 |
| `exampledialogue` | `{{exampledialogue}}` | 예시 대화 |

### 변수 조작

| 함수 | 구문 | 설명 |
|------|------|------|
| `getvar` | `{{getvar::이름}}` | 채팅 변수 가져오기 |
| `setvar` | `{{setvar::이름::값}}` | 채팅 변수 설정 |
| `addvar` | `{{addvar::이름::숫자}}` | 숫자 변수 더하기 |
| `setdefaultvar` | `{{setdefaultvar::이름::값}}` | 비어있을 때만 설정 |
| `getglobalvar` | `{{getglobalvar::이름}}` | 글로벌 변수 가져오기 |
| `tempvar` / `gettempvar` | `{{tempvar::이름}}` | 임시 변수 가져오기 |
| `settempvar` | `{{settempvar::이름::값}}` | 임시 변수 설정 |

### 문자열 함수

| 함수 | 구문 | 설명 |
|------|------|------|
| `replace` | `{{replace::문자열::대상::치환}}` | 문자열 치환 |
| `split` | `{{split::문자열::구분자}}` | 문자열 분할 → JSON 배열 |
| `join` | `{{join::배열::구분자}}` | 배열 합치기 |
| `trim` | `{{trim::문자열}}` | 앞뒤 공백 제거 |
| `length` | `{{length::문자열}}` | 문자열 길이 |
| `lower` / `upper` | `{{lower::문자열}}` | 대/소문자 변환 |
| `capitalize` | `{{capitalize::문자열}}` | 첫 글자 대문자화 |
| `contains` | `{{contains::문자열::검색어}}` | 포함 여부 확인 |
| `startswith` / `endswith` | `{{startswith::문자열::접두사}}` | 시작/끝 여부 |
| `reverse` | `{{reverse::문자열}}` | 문자열 뒤집기 |
| `spread` | `{{spread::배열}}` | 배열을 `::`로 합침 |

### 숫자 함수

| 함수 | 구문 | 설명 |
|------|------|------|
| `calc` / `?` | `{{calc::2+2*3}}` | 수식 계산 |
| `round` / `floor` / `ceil` | `{{round::3.7}}` | 반올림/내림/올림 |
| `abs` | `{{abs::-5}}` | 절댓값 |
| `pow` | `{{pow::2::10}}` | 거듭제곱 |
| `remaind` | `{{remaind::10::3}}` | 나머지 (모듈로) |
| `tonumber` | `{{tonumber::abc123}}` | 숫자 문자 추출 |
| `fixnum` | `{{fixnum::3.14159::2}}` | 소수점 자릿수 지정 |

### 배열 & 객체 함수

| 함수 | 구문 | 설명 |
|------|------|------|
| `arraylength` | `{{arraylength::배열}}` | 배열 길이 |
| `arrayelement` | `{{arrayelement::배열::인덱스}}` | 인덱스로 요소 가져오기 |
| `arraypush` | `{{arraypush::배열::요소}}` | 요소 추가 |
| `arraypop` | `{{arraypop::배열}}` | 마지막 요소 제거 |
| `arrayshift` | `{{arrayshift::배열}}` | 첫 요소 제거 |
| `arraysplice` | `{{arraysplice::배열::시작::개수::요소}}` | splice 연산 |
| `makearray` | `{{makearray::a::b::c}}` | 배열 생성 |
| `dictelement` | `{{dictelement::객체::키}}` | 객체 속성 접근 |
| `element` | `{{element::json::키1::키2}}` | 깊은 요소 접근 |
| `makedict` | `{{makedict::k1=v1::k2=v2}}` | 객체 생성 |
| `filter` | `{{filter::배열::유형}}` | 배열 필터링 |

### 비교 & 논리

| 함수 | 구문 | 설명 |
|------|------|------|
| `equal` / `notequal` | `{{equal::a::b}}` | 같음/다름 |
| `greater` / `less` | `{{greater::5::3}}` | 크기 비교 |
| `greaterequal` / `lessequal` | `{{greaterequal::5::5}}` | 이상/이하 |
| `and` / `or` / `not` | `{{and::1::1}}` | 논리 연산 |
| `all` / `any` | `{{all::1::1::0}}` | 전체/부분 검증 |

### 블록 구문 (#when)

```
{{#when::조건}}내용{{/}}
{{#when::A::is::B}}일치{{:else}}불일치{{/}}
{{#when::A::isnot::B}}...{{/}}
{{#when::A::>::B}}...{{/}}
{{#when::A::>=::B}}...{{/}}
{{#when::A::<::B}}...{{/}}
{{#when::A::<=::B}}...{{/}}
{{#when::A::and::B}}...{{/}}
{{#when::A::or::B}}...{{/}}
{{#when::var::변수명}}...{{/}}
{{#when::toggle::토글명}}...{{/}}
{{#when::keep::조건}}내용 (공백 보존){{/}}
```

### 블록 구문 (#each)

```
{{#each [1, 2, 3] as n}}
  항목: {{slot::n}}
{{/}}
```

### 날짜/시간

| 함수 | 구문 | 설명 |
|------|------|------|
| `time` | `{{time}}` | 현재 시각 HH:MM:SS |
| `date` | `{{date}}` 또는 `{{date::YYYY-MM-DD}}` | 현재 날짜 |
| `isotime` / `isodate` | `{{isotime}}` | UTC 시간/날짜 |
| `unixtime` | `{{unixtime}}` | Unix 타임스탬프 |
| `idleduration` | `{{idleduration}}` | 마지막 메시지 이후 경과 시간 |

### 랜덤 & 확률

| 함수 | 구문 | 설명 |
|------|------|------|
| `random` | `{{random::a,b,c}}` | 랜덤 선택 (진짜 랜덤) |
| `pick` | `{{pick::a::b::c}}` | 랜덤 선택 (해시 기반, 결정적) |
| `randint` | `{{randint::1::100}}` | 범위 내 랜덤 정수 |
| `roll` / `dice` | `{{roll::2d6}}` | 주사위 굴리기 |
| `hash` | `{{hash::문자열}}` | 결정적 해시 → 7자리 숫자 |

### 에셋 & 표시

| 함수 | 구문 | 설명 |
|------|------|------|
| `image` / `img` | `{{image::경로}}` | 이미지 표시 |
| `video` | `{{video::경로}}` | 비디오 표시 |
| `audio` | `{{audio::경로}}` | 오디오 재생 |
| `bg` | `{{bg::배경이름}}` | 배경 설정 |
| `bgm` | `{{bgm::음악이름}}` | BGM 재생 |
| `emotion` | `{{emotion::감정이름}}` | 감정 이미지 표시 |
| `asset` | `{{asset::에셋이름}}` | 캐릭터 에셋 표시 |
| `inlay` | `{{inlay::에셋이름}}` | 인라인 에셋 |

### 메타데이터

```
{{metadata::VERSION}}
{{metadata::LANGUAGE}}
{{metadata::MODELNAME}}
{{metadata::MAXCONTEXT}}
{{metadata::RISUTYPE}}
{{metadata::IMATEAPOT}}    → 🫖
```

### 암호화 & 인코딩

| 함수 | 구문 | 설명 |
|------|------|------|
| `xor` | `{{xor::텍스트}}` | XOR 암호화 + Base64 |
| `xordecrypt` / `xord` | `{{xordecrypt::base64}}` | XOR 복호화 |
| `crypt` / `caesar` | `{{crypt::텍스트::시프트}}` | 시저 암호 |
| `tohex` | `{{tohex::문자열}}` | 16진수 변환 |
| `fromhex` | `{{fromhex::hex문자열}}` | 16진수 복원 |

### 집계 함수

| 함수 | 구문 | 설명 |
|------|------|------|
| `min` / `max` | `{{min::5::2::8}}` | 최솟값/최댓값 |
| `sum` | `{{sum::1::2::3}}` | 합계 |
| `average` | `{{average::2::4::6}}` | 평균 |

### 특수 함수

| 함수 | 구문 | 설명 |
|------|------|------|
| `return` | `{{return::값}}` | 스크립트 종료 및 값 반환 |
| `button` | `{{button::텍스트::트리거}}` | 클릭 가능한 버튼 생성 |
| `slot` | `{{slot::변수명}}` | #each 루프 변수 참조 |
| `blank` / `none` | `{{blank}}` | 빈 문자열 반환 |
| `tex` | `{{tex::LaTeX수식}}` | LaTeX 수학 렌더링 |
| `ruby` | `{{ruby::텍스트::읽기}}` | 루비 텍스트 (후리가나) |
| `codeblock` | `{{codeblock::언어::코드}}` | 코드 블록 |
| `declare` | `{{declare::이름::값}}` | 변수 선언 |

---

## 예제

### 기본 캐릭터 응답

```
안녕하세요, 저는 {{char}}입니다.
{{user}}님, 반갑습니다!

{{#when::var::mood}}
현재 기분: {{getvar::mood}}
{{:else}}
기분이 설정되지 않았습니다.
{{/}}
```

### 호감도 시스템

```
{{setdefaultvar::affinity::50}}
{{#when::{{getvar::affinity}}::>=::80}}
  {{char}}가 당신을 매우 좋아합니다! {{emotion::happy}}
{{:else}}
  {{#when::{{getvar::affinity}}::>=::50}}
    {{char}}가 당신에게 호감을 느낍니다.
  {{:else}}
    {{char}}가 무관심합니다.
  {{/}}
{{/}}
```

### 주사위 시스템

```
{{//::전투 시스템}}
주사위를 굴립니다: {{roll::2d6}}
{{setvar::damage::{{calc::{{roll::1d8}}+3}}}}
{{char}}가 {{getvar::damage}}의 피해를 입혔습니다!
```

### 에셋 기반 씬

```
{{bg::forest_night}}
{{bgm::ambient_forest}}

{{#each::keep ["나무", "바위", "강"] as item}}
주변에 {{slot::item}}이(가) 있습니다.
{{/}}

{{image::forest_scene.png}}
```

---

## 파일 구조

```
codemirror5mode/
├── risuai-cbs-mode.js     ← CodeMirror 5 모드 정의
├── risuai-cbs-mode.md     ← 이 문서
├── test.css               ← CBS 토큰용 커스텀 스타일시트
└── test.html              ← CDN 기반 테스트 페이지
```

---

## 라이선스

MIT License
