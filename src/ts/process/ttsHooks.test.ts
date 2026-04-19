import { describe, it, expect, vi } from 'vitest';
import {
    runHookPipeline,
    type BeforeTTSContext,
    type BeforeTTSResult,
    type TTSHookFn,
} from './ttsHooks';

const makeCtx = (overrides: Partial<BeforeTTSContext> = {}): BeforeTTSContext => ({
    text: 'hello',
    ttsMode: 'openai',
    characterId: 'char-1',
    ...overrides,
});

describe('runHookPipeline', () => {
    it('returns the original ctx when no hooks are registered', async () => {
        const ctx = makeCtx();
        const result = await runHookPipeline<BeforeTTSContext, BeforeTTSResult>([], ctx, 1000);
        expect(result.skip).toBe(false);
        expect(result.ctx).toEqual(ctx);
    });

    it('applies a single hook that transforms text', async () => {
        const hook: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async (c) => ({ text: c.text + '!' });
        const result = await runHookPipeline([hook], makeCtx(), 1000);
        expect(result.skip).toBe(false);
        expect(result.ctx.text).toBe('hello!');
    });

    it('chains two hooks — second sees the first\'s output', async () => {
        const a: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async (c) => ({ text: c.text + ' A' });
        const b: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async (c) => ({ text: c.text + ' B' });
        const result = await runHookPipeline([a, b], makeCtx(), 1000);
        expect(result.ctx.text).toBe('hello A B');
    });

    it('short-circuits on skip=true and does not call later hooks', async () => {
        const a: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async () => ({ skip: true });
        const b = vi.fn<TTSHookFn<BeforeTTSContext, BeforeTTSResult>>(async (c) => ({ text: c.text + ' B' }));
        const result = await runHookPipeline([a, b], makeCtx(), 1000);
        expect(result.skip).toBe(true);
        expect(b).not.toHaveBeenCalled();
    });

    it('isolates a hook that throws — continues with next hook, keeps original ctx for the throwing one', async () => {
        const a: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async () => { throw new Error('boom'); };
        const b: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async (c) => ({ text: c.text + ' B' });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const result = await runHookPipeline([a, b], makeCtx(), 1000);
            expect(result.skip).toBe(false);
            expect(result.ctx.text).toBe('hello B');
            expect(errSpy).toHaveBeenCalled();
        } finally {
            errSpy.mockRestore();
        }
    });

    it('isolates a hook that exceeds the timeout', async () => {
        const slow: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = () => new Promise(() => { /* never resolves */ });
        const fast: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async (c) => ({ text: c.text + ' F' });
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const result = await runHookPipeline([slow, fast], makeCtx(), 50);
            expect(result.skip).toBe(false);
            expect(result.ctx.text).toBe('hello F');
        } finally {
            errSpy.mockRestore();
        }
    });

    it('treats an undefined return as a no-op', async () => {
        const noop: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async () => undefined;
        const next: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async (c) => ({ text: c.text + ' N' });
        const result = await runHookPipeline([noop, next], makeCtx(), 1000);
        expect(result.ctx.text).toBe('hello N');
    });

    it('ignores undefined fields in a result (does not overwrite ctx with undefined)', async () => {
        const hook: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = async () => ({ text: undefined });
        const result = await runHookPipeline([hook], makeCtx({ text: 'keep-me' }), 1000);
        expect(result.ctx.text).toBe('keep-me');
    });

    it('accepts synchronous (non-Promise) returns', async () => {
        const hook: TTSHookFn<BeforeTTSContext, BeforeTTSResult> = (c) => ({ text: c.text + ' S' });
        const result = await runHookPipeline([hook], makeCtx(), 1000);
        expect(result.ctx.text).toBe('hello S');
    });
});
