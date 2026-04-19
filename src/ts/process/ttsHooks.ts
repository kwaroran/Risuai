const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface BeforeTTSContext {
    text: string;
    ttsMode: string;
    characterId: string;
}

export interface BeforeTTSResult {
    text?: string;
    skip?: boolean;
}

export interface AfterTTSContext {
    audio: ArrayBuffer;
    mimeType: string;
    ttsMode: string;
    characterId: string;
}

export interface AfterTTSResult {
    audio?: ArrayBuffer;
    mimeType?: string;
    skip?: boolean;
}

export type TTSHookFn<Ctx, Res> = (ctx: Ctx) => Promise<Res | void> | Res | void;

const preprocessors: TTSHookFn<BeforeTTSContext, BeforeTTSResult>[] = [];
const postprocessors: TTSHookFn<AfterTTSContext, AfterTTSResult>[] = [];

export function registerTTSPreprocessor(fn: TTSHookFn<BeforeTTSContext, BeforeTTSResult>): void {
    preprocessors.push(fn);
}

export function unregisterTTSPreprocessor(fn: TTSHookFn<BeforeTTSContext, BeforeTTSResult>): void {
    const idx = preprocessors.indexOf(fn);
    if (idx !== -1) preprocessors.splice(idx, 1);
}

export function registerTTSPostprocessor(fn: TTSHookFn<AfterTTSContext, AfterTTSResult>): void {
    postprocessors.push(fn);
}

export function unregisterTTSPostprocessor(fn: TTSHookFn<AfterTTSContext, AfterTTSResult>): void {
    const idx = postprocessors.indexOf(fn);
    if (idx !== -1) postprocessors.splice(idx, 1);
}

export function getTTSPreprocessors(): ReadonlyArray<TTSHookFn<BeforeTTSContext, BeforeTTSResult>> {
    return preprocessors;
}

export function getTTSPostprocessors(): ReadonlyArray<TTSHookFn<AfterTTSContext, AfterTTSResult>> {
    return postprocessors;
}

export async function runHookPipeline<Ctx extends object, Res extends { skip?: boolean }>(
    hooks: ReadonlyArray<TTSHookFn<Ctx, Res>>,
    ctx: Ctx,
    timeoutMs?: number,
): Promise<{ ctx: Ctx; skip: boolean }> {
    const TIMEOUT = Symbol('TIMEOUT');
    let current: Ctx = { ...ctx };

    for (const hook of hooks) {
        let result: Res | void | typeof TIMEOUT;
        try {
            const hookPromise = Promise.resolve().then(() => hook(current));
            if (timeoutMs !== undefined && timeoutMs > 0) {
                result = await Promise.race<Res | void | typeof TIMEOUT>([
                    hookPromise,
                    sleep(timeoutMs).then(() => TIMEOUT),
                ]);
            } else {
                result = await hookPromise;
            }
        } catch (err) {
            console.error('[TTS hook] threw, continuing with next hook:', err);
            continue;
        }

        if (result === TIMEOUT) {
            console.error('[TTS hook] timed out, continuing with next hook');
            continue;
        }

        if (!result) continue;

        if (result.skip) {
            return { ctx: current, skip: true };
        }

        for (const key of Object.keys(result) as (keyof Res)[]) {
            if (key === 'skip') continue;
            const v = (result as any)[key];
            if (v !== undefined) (current as any)[key] = v;
        }
    }

    return { ctx: current, skip: false };
}
