import { describe, expect, it, vi } from "vitest";
import { countVoyageTokens } from "src/ts/tokenizer";
import type { HypaModel } from "./hypamemory";
import { batchByTokenBudget, countUtf8Bytes, getEmbeddingTokenCounter } from "./embeddingBatch";

vi.mock("src/ts/tokenizer", () => ({ countVoyageTokens: vi.fn() }));

describe("countUtf8Bytes", () => {
    it.each([["a", 1], ["가", 3], ["🙂", 4]] as const)("counts %s as %i bytes", (text, bytes) => {
        expect(countUtf8Bytes(text)).toBe(bytes);
    });
});

describe("batchByTokenBudget", () => {
    it.each([
        [[60_000, 60_000], [[0], [1]]],
        [[50_000, 50_000, 10_000], [[0, 1, 2]]],
        [[200_000, 1_000, 1_000], [[0], [1, 2]]],
    ])("batches token counts %j", (counts, expected) => {
        const items = counts.map((_, index) => index);
        expect(batchByTokenBudget(items, counts, 50)).toEqual(expected);
    });

    it("respects the item limit and preserves order", () => {
        const items = Array.from({ length: 120 }, (_, index) => index);
        const batches = batchByTokenBudget(items, items.map(() => 1), 50);
        expect(batches.map(batch => batch.length)).toEqual([50, 50, 20]);
        expect(batches.flat()).toEqual(items);
    });

    it("returns no batches for no items", () => {
        expect(batchByTokenBudget([], [], 50)).toEqual([]);
    });
});

describe("getEmbeddingTokenCounter", () => {
    it.each<[HypaModel, string | undefined]>([
        ["voyageContext3", undefined],
        ["custom", "voyage-3-large"],
        ["custom", "  Voyage-3-Large "],
    ])("uses Voyage for %s / %s", (model, name) => {
        expect(getEmbeddingTokenCounter(model, name)).toBe(countVoyageTokens);
    });

    it.each<[HypaModel, string | undefined]>([
        ["custom", "text-embedding-3-small"],
        ["custom", ""],
        ["custom", undefined],
        ["openai3large", undefined],
        ["ada", undefined],
        ["openai3small", undefined],
    ])("uses bytes for %s / %s", (model, name) => {
        expect(getEmbeddingTokenCounter(model, name)).toBe(countUtf8Bytes);
    });
});
