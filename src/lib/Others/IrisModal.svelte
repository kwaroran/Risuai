<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { onMount } from "svelte";
    import IrisImage from "../../etc/Airisu.webp";
    import { DBState, irisStore } from "src/ts/stores.svelte";
    import { requestChatData } from "src/ts/process/request/request";
    import { alertError } from "src/ts/alert";
    import { getIrisSystemPrompt } from "src/ts/iris";
    import { RisuAccessClient } from "src/ts/process/mcp/risuaccess";
    import localforage from "localforage";
    import { getModelInfo, LLMFormat } from "src/ts/model/modellist";

    interface DialogueLine {
        speaker: string;
        text: string;
        tip?: string; // Optional tooltip for the line
    }

    interface OpenAIChat {
        role: 'system' | 'user' | 'assistant';
        content: string;
    }

    const introDialogue: Record<string, DialogueLine[]> = {
        en: [
            { speaker: "Iris", text: "Hello there. I've been waiting for you.", tip: "Iris can access various data through the Risuai system. It uses ax model defined in config." },
        ],
        ko: [
            { speaker: "Iris", text: "안녕하세요. 아이리스라고 합니다~.", tip: "아이리스는 보조 모델을 사용하며, Risuai의 전반적인 데이터에 접근할 수 있습니다." },
        ],
        'zh-Hant': [
            { speaker: "Iris", text: "你好，我一直在等你。", tip: "Iris 可以通過 Risuai 系統訪問各種數據。它使用配置中定義的輔助模型。" },
        ],
    };

    const unsupportedModelDialogue: Record<string, DialogueLine[]> = {
        en: [
            { speaker: "Iris", text: "It seems your current model doesn't support me responding... Please switch to a compatible model, like GPT, Claude, or Gemini which are not plugins." },
        ],
        ko: [
            { speaker: "Iris", text: "현재 모델이 제가 응답하는걸 지원하지 않는 것 같아요. 플러그인이 아닌 GPT, Claude, Gemini 모델로 전환해주세요." },
        ],
        'zh-Hant': [
            { speaker: "Iris", text: "看起来您当前的模型不支持我响应... 请切换到兼容的模型，如 GPT、Claude 或 Gemini，这些都不是插件。" },
        ],
    };

    const forageInstance = localforage.createInstance({
        name: "iris_dialogues",
        storeName: "iris_dialogues",
    });

    let dialogue = $state<DialogueLine[]>(
        introDialogue[DBState.db.language] ?? introDialogue.en
    );

    let currentIndex = $state(0);
    let displayedText = $state("");
    let isTyping = $state(false);
    let showBacklog = $state(false);
    let backlogEl = $state<HTMLDivElement | null>(null);

    // User input state
    let userInput = $state("");
    let userInputEl = $state<HTMLInputElement | null>(null);
    
    let isUnsupportedModel = $derived.by(() => {
        const currentModel = (DBState.db.seperateModelsForAxModels ? DBState.db.seperateModels.otherAx : '') || DBState.db.subModel;
        const modelInfo = getModelInfo(currentModel);
        return !(
            modelInfo.format === LLMFormat.Anthropic ||
            modelInfo.format === LLMFormat.OpenAICompatible ||
            modelInfo.format === LLMFormat.VertexAIGemini ||
            modelInfo.format === LLMFormat.GoogleCloud
        )
    })

    let typingTimeout: ReturnType<typeof setTimeout> | null = null;

    const atEnd = $derived(!isTyping && currentIndex >= dialogue.length - 1);
    const waitingForReply = $derived(
        atEnd && dialogue[dialogue.length - 1]?.speaker === "You",
    );
    const seenDialogue = $derived(dialogue.slice(0, currentIndex + 1));

    function startTyping(text: string) {
        displayedText = "";
        isTyping = true;
        let i = 0;

        function typeNext() {
            if (i < text.length) {
                displayedText += text[i];
                i++;
                typingTimeout = setTimeout(typeNext, 30);
            } else {
                isTyping = false;
            }
        }

        typeNext();
    }

    function hide() {
        irisStore.open = false;
    }

    function advance() {
        if (showBacklog || atEnd) return;

        if (isTyping) {
            if (typingTimeout) clearTimeout(typingTimeout);
            displayedText = dialogue[currentIndex].text;
            isTyping = false;
            return;
        }

        if (currentIndex < dialogue.length - 1) {
            currentIndex++;
            startTyping(dialogue[currentIndex].text);
        }
    }

    function splitSentences(text: string): string[] {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
        return Array.from(segmenter.segment(text))
            .map(s => s.segment.trim())
            .filter(s => s.length > 0);
    }

    function trimDialogueMeta(text: string): string {
        //
        return text.replace(/|\(.*?\)|\{\{.*?\}\}/g, '').replace(/<.*?>(.*?)<\/.*?>/g, '').trim()
    }

    /** Push a new line and immediately advance to it.
     *  Iris lines are split into individual sentences. */
    export function pushDialogue(line: DialogueLine) {
        line.text = trimDialogueMeta(line.text);
        const sentences = line.speaker !== 'You'
            ? splitSentences(line.text)
            : [line.text];

        const wasAtEnd = currentIndex === dialogue.length - 1;

        for (const text of sentences) {
            dialogue.push({ speaker: line.speaker, text });
        }

        if (wasAtEnd) {
            currentIndex++;
            startTyping(dialogue[currentIndex].text);
        }

        saveDialogue();
    }

    function saveDialogue() {
        forageInstance.setItem("current_dialogue", safeStructuredClone(dialogue)).catch((e) => {
            
            console.warn("Failed to save dialogue to localforage.", e);
        });
    }

    async function submitUserInput() {
        const trimmed = userInput.trim();
        if (!trimmed) return;
        if (isUnsupportedModel) return
        pushDialogue({ speaker: "You", text: trimmed });
        userInput = "";

        const history: OpenAIChat[] = [
            { role: 'system', content: await getIrisSystemPrompt() },
            ...dialogue
                .filter(l => l.speaker === 'You' || l.speaker === 'Iris')
                .map(l => ({
                    role: (l.speaker === 'You' ? 'user' : 'assistant') as 'user' | 'assistant',
                    content: l.text,
                })),
        ];

        await requestLLM(history);
    }

    function handleKey(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (showBacklog) {
                showBacklog = false;
                return;
            }
            hide()
            return;
        }
        if (e.key === "l" || e.key === "L") {
            showBacklog = !showBacklog;
            return;
        }
        if (showBacklog || atEnd) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            advance();
        }
    }

    function handleInputKey(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            submitUserInput();
        }
        e.stopPropagation();
    }

    function openBacklog() {
        showBacklog = true;
        // scroll to bottom after paint
        setTimeout(
            () =>
                backlogEl?.scrollTo({
                    top: backlogEl.scrollHeight,
                    behavior: "instant",
                }),
            50,
        );
    }

    async function requestLLM(chat:OpenAIChat[]) {
        const res = await requestChatData({
            formated: chat,
            bias: {},
            tools: await (new RisuAccessClient()).getToolList(),
        }, 'otherAx');
        if(res.type === 'success') {
            pushDialogue({speaker: 'Iris', text: res.result});
        } else {
            alertError("Failed to get response from LLM: " + res.result);
            dialogue.pop();
        }
    }

    onMount(() => {

        //get dialogue from localforage if exists
        forageInstance.getItem<DialogueLine[]>("current_dialogue").then((saved) => {
            if (saved && saved.length > 0) {
                dialogue = saved;
                currentIndex = dialogue.length - 1;
            } else {
                dialogue = introDialogue[DBState.db.language] ?? introDialogue.en;
                currentIndex = 0;
            }
            startTyping(dialogue[currentIndex].text);
        }).catch(() => {
            dialogue = introDialogue[DBState.db.language] ?? introDialogue.en;
            currentIndex = 0;
            startTyping(dialogue[currentIndex].text);
        });

        

    });

    $effect(() => {
        if (atEnd && userInputEl) userInputEl.focus();
    });

    $effect(() => {
        if (showBacklog && backlogEl) {
            void seenDialogue.length;
            setTimeout(
                () =>
                    backlogEl?.scrollTo({
                        top: backlogEl.scrollHeight,
                        behavior: "smooth",
                    }),
                50,
            );
        }
    });

    function resetDialogue() {
        dialogue = introDialogue[DBState.db.language] ?? introDialogue.en;
        currentIndex = 0;
        saveDialogue();
        startTyping(dialogue[0].text);
    }
</script>

<svelte:window onkeydown={handleKey} />

<div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
    transition:fade={{ duration: 300 }}
    role="presentation"
>

    <!-- Close button (mobile only) -->
    <button
        onclick={hide}
        class="absolute right-4 top-4 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs text-white/50 transition hover:bg-black/60 hover:text-white/80"
        aria-label="Close"
    >
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Close
    </button>

    <!-- Character sprite -->
    <div
        class="absolute bottom-55 left-1/2 -translate-x-1/2"
        transition:fly={{ y: 20, duration: 400 }}
    >
        <img
            src={IrisImage}
            alt="Iris"
            class="h-120 w-auto object-contain drop-shadow-2xl"
        />
    </div>

    <!-- Backlog overlay -->
    {#if showBacklog}
        <div
            class="absolute inset-0 z-10 flex items-center justify-center bg-black/70"
            transition:fade={{ duration: 200 }}
        >
            <div
                class="flex w-full max-w-2xl flex-col rounded-2xl border border-white/15 bg-black/90 shadow-2xl"
                style="max-height: 70vh;"
                transition:fly={{ y: -20, duration: 250 }}
            >
                <!-- Header -->
                <div
                    class="flex items-center justify-end border-b border-white/10 px-6 py-3 gap-3"
                >
                    <button
                        class="text-white/40 transition hover:text-white/80"
                        aria-label="Reset"
                        onclick={() => {
                            resetDialogue();
                            showBacklog = false;
                        }}
                    >
                        <svg
                            class="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                    </button>
                    <button
                        onclick={() => (showBacklog = false)}
                        class="text-white/40 transition hover:text-white/80"
                        aria-label="Close backlog"
                    >
                        <svg
                            class="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <!-- Scrollable log -->
                <div
                    bind:this={backlogEl}
                    class="flex-1 overflow-y-auto px-6 py-4 space-y-4"
                >
                    {#each seenDialogue as line, i}
                        <div
                            class="flex flex-col gap-0.5 {line.speaker ===
                            'You'
                                ? 'items-end'
                                : 'items-start'}"
                        >
                            <span
                                class="text-xs font-semibold {line.speaker ===
                                'You'
                                    ? 'text-emerald-400'
                                    : 'text-indigo-400'}"
                            >
                                {line.speaker}
                            </span>
                            <div
                                class="max-w-prose rounded-xl px-4 py-2 text-sm leading-relaxed text-white/90
                {line.speaker === 'You'
                                    ? 'rounded-tr-sm bg-emerald-900/60'
                                    : 'rounded-tl-sm bg-indigo-900/60'}
                {i === currentIndex ? 'ring-1 ring-white/20' : ''}"
                            >
                                {line.text}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {/if}

    <!-- Dialogue box -->
    <div
        class="relative mb-6 w-full max-w-4xl px-4"
        transition:fly={{ y: 40, duration: 300 }}
    >
        <div
            class="relative rounded-xl border border-white/20 bg-black/80 px-8 py-6 shadow-2xl"
        >
            <!-- Backlog button -->
            <button
                onclick={openBacklog}
                title="View backlog (L)"
                class="absolute right-4 top-4 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/40 transition hover:bg-white/10 hover:text-white/70"
            >
                <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M4 6h16M4 10h16M4 14h10"
                    />
                </svg>
                Log
            </button>

            <!-- Speaker name tag -->
            {#if dialogue[currentIndex].speaker}
                <div
                    class="absolute -top-5 left-6 rounded-md px-4 py-1 text-sm font-semibold tracking-wide text-white shadow-lg
            {dialogue[currentIndex].speaker === 'You'
                        ? 'bg-emerald-600'
                        : 'bg-indigo-600'}"
                >
                    {dialogue[currentIndex].speaker}
                </div>
            {/if}

            <!-- Dialogue text -->
            <div
                onclick={advance}
                role="button"
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } }}
                aria-label={isTyping ? 'Dialogue loading…' : `${dialogue[currentIndex].speaker}: ${displayedText}. Click to advance.`}
                aria-live="polite"
                aria-atomic="true"
                class="min-h-20 cursor-pointer select-none text-base leading-relaxed text-white/90"
            >
                {displayedText}
                {#if isTyping}
                    <span class="animate-pulse" aria-hidden="true">▌</span>
                {:else if dialogue[currentIndex].tip}
                    <div class="mt-2 rounded-md bg-white/10 px-3 py-2 text-sm text-white/70">
                        {dialogue[currentIndex].tip}
                    </div>
                {/if}
                {#if isUnsupportedModel}
                    <div class="mt-2 rounded-md bg-red-600/80 px-3 py-2 text-sm text-white">
                        {unsupportedModelDialogue[DBState.db.language]?.[0].text ?? unsupportedModelDialogue.en[0].text}
                    </div>
                {/if}
            </div>

            <!-- Waiting-for-reply loading dots -->
            {#if waitingForReply}
                <div
                    class="mt-1 flex items-center gap-2"
                    transition:fade={{ duration: 150 }}
                >
                    <span class="text-xs text-white/40">Iris is typing</span
                    >
                    <span class="flex gap-1">
                        <span
                            class="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:0ms]"
                        ></span>
                        <span
                            class="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:150ms]"
                        ></span>
                        <span
                            class="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:300ms]"
                        ></span>
                    </span>
                </div>
            {/if}

            {#if atEnd}
                <div
                    class="mt-4 flex items-center gap-2"
                    transition:fly={{ y: 8, duration: 200 }}
                >
                    <input
                        bind:this={userInputEl}
                        bind:value={userInput}
                        onkeydown={handleInputKey}
                        type="text"
                        placeholder={waitingForReply
                            ? "Waiting for reply…"
                            : "Type a message…"}
                        disabled={waitingForReply}
                        class="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-400 focus:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <button
                        onclick={submitUserInput}
                        disabled={!userInput.trim() || waitingForReply || isUnsupportedModel}
                        class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                    >
                        Send
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <!-- Click-to-advance overlay -->
    {#if !atEnd && !showBacklog}
        <button
            onclick={advance}
            class="absolute inset-0 -z-10 h-full w-full cursor-pointer bg-transparent"
            aria-label="Advance dialogue"
        ></button>
    {/if}
</div>
