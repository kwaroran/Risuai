import { countVoyageTokens } from "src/ts/tokenizer";
import type { HypaModel } from "./hypamemory";

export const MAX_EMBEDDING_TOKENS_PER_REQUEST = 110_000;

export type EmbeddingTokenCounter = (text: string) => number | Promise<number>;

export function countUtf8Bytes(text: string): number {
    return new TextEncoder().encode(text).length;
}

export function getEmbeddingTokenCounter(model: HypaModel, customModelName?: string): EmbeddingTokenCounter {
    if (model === "voyageContext3" || (model === "custom" && customModelName?.trim().toLowerCase().startsWith("voyage-"))) {
        return countVoyageTokens;
    }
    return countUtf8Bytes;
}

export function batchByTokenBudget<T>(
    items: readonly T[],
    tokenCounts: readonly number[],
    maxItems: number,
    maxTokens = MAX_EMBEDDING_TOKENS_PER_REQUEST
): T[][] {
    const batches: T[][] = [];
    let batch: T[] = [];
    let tokens = 0;

    for (let index = 0; index < items.length; index++) {
        if (batch.length > 0 && (batch.length >= maxItems || tokens + tokenCounts[index] > maxTokens)) {
            batches.push(batch);
            batch = [];
            tokens = 0;
        }
        batch.push(items[index]);
        tokens += tokenCounts[index];
    }

    if (batch.length > 0) {
        batches.push(batch);
    }
    return batches;
}
