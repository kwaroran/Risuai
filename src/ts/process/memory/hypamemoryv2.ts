import localforage from "localforage";
import { type HypaModel, localModels } from "./hypamemory";
import { TaskRateLimiter, TaskCanceledError } from "./taskRateLimiter";
import { runEmbedding } from "../transformers";
import { globalFetch } from "src/ts/globalApi.svelte";
import { getDatabase } from "src/ts/storage/database.svelte";
import { appendLastPath } from "src/ts/util";
import { isMobile } from "src/ts/platform";

export interface HypaProcessorV2Options {
  model?: HypaModel;
  customEmbeddingUrl?: string;
  oaiKey?: string;
  rateLimiter?: TaskRateLimiter;
}

export interface EmbeddingText<TMetadata> {
  id: string;
  content: string;
  metadata?: TMetadata;
}

export interface EmbeddingResult<TMetadata> extends EmbeddingText<TMetadata> {
  embedding: EmbeddingVector;
}

export type EmbeddingVector = number[] | Float32Array;

export class HypaProcessorV2<TMetadata> {
  private static readonly LOG_PREFIX = "[HypaProcessorV2]";
  public readonly options: HypaProcessorV2Options;
  public progressCallback: (queuedCount: number) => void = null;
  public vectors: Map<string, EmbeddingResult<TMetadata>> = new Map();
  private forage: LocalForage = localforage.createInstance({
    name: "hypaVector",
  });

  public constructor(options?: HypaProcessorV2Options) {
    const db = getDatabase();

    this.options = {
      model: db.hypaModel || "MiniLM",
      customEmbeddingUrl: db.hypaCustomSettings?.url?.trim() || "",
      oaiKey: db.supaMemoryKey?.trim() || "",
      rateLimiter: new TaskRateLimiter(),
      ...options,
    };
  }

  public async addTexts(ebdTexts: EmbeddingText<TMetadata>[]): Promise<void> {
    await this.getEmbeds(ebdTexts, true);
  }

  public async similaritySearchScored(
    query: string
  ): Promise<[EmbeddingResult<TMetadata>, number][]> {
    const results = await this.similaritySearchScoredBatch([query]);
    return results[0];
  }

  public async similaritySearchScoredBatch(
    queries: string[]
  ): Promise<[EmbeddingResult<TMetadata>, number][][]> {
    if (queries.length === 0) {
      return [];
    }

    // Remove duplicate queries
    const uniqueQueries = [...new Set(queries)];

    // Convert queries to EmbeddingText array
    const ebdTexts: EmbeddingText<TMetadata>[] = uniqueQueries.map(
      (query, index) => ({
        id: `query-${index}`,
        content: query,
      })
    );

    // Get query embeddings (don't save to memory)
    const ebdResults = await this.getEmbeds(ebdTexts, false);

    const scoredResultsMap = new Map<
      string,
      [EmbeddingResult<TMetadata>, number][]
    >();

    // Calculate similarity for each unique query
    for (let i = 0; i < uniqueQueries.length; i++) {
      const ebdResult = ebdResults[i];

      const scoredVectors = Array.from(this.vectors.values())
        .map((vector): [EmbeddingResult<TMetadata>, number] => [
          vector,
          this.similarity(ebdResult.embedding, vector.embedding),
        ])
        .sort((a, b) => b[1] - a[1]);

      scoredResultsMap.set(uniqueQueries[i], scoredVectors);
    }

    return queries.map((query) => scoredResultsMap.get(query));
  }

  private async getEmbeds(
    ebdTexts: EmbeddingText<TMetadata>[],
    saveToMemory: boolean = true
  ): Promise<EmbeddingResult<TMetadata>[]> {
    if (ebdTexts.length === 0) {
      return [];
    }

    const resultMap: Map<string, EmbeddingResult<TMetadata>> = new Map();
    const toEmbed: EmbeddingText<TMetadata>[] = [];

    // Load cache
    const loadPromises = ebdTexts.map(async (item, index) => {
      const { id, content, metadata } = item;

      // Use if already in memory
      if (this.vectors.has(id)) {
        resultMap.set(id, this.vectors.get(id));
        return;
      }

      try {
        const cached = await this.forage.getItem<EmbeddingResult<TMetadata>>(
          this.getCacheKey(content)
        );

        if (cached) {
          // Debug log for cache hit
          console.debug(
            HypaProcessorV2.LOG_PREFIX,
            `Cache hit for getting embedding ${index} with model ${this.options.model}`
          );

          // Add metadata
          cached.metadata = metadata;

          // Save to memory
          if (saveToMemory) {
            this.vectors.set(id, cached);
          }

          resultMap.set(id, cached);
        } else {
          toEmbed.push(item);
        }
      } catch (error) {
        toEmbed.push(item);
      }
    });

    await Promise.all(loadPromises);

    if (this.options.model === 'voyageContext3' && toEmbed.length > 0 && saveToMemory) {
      const missMetadatas = new Set(
        toEmbed.map((item) => item.metadata).filter(Boolean)
      );

      const additionalItems = ebdTexts.filter(
        (item) =>
          item.metadata &&
          missMetadatas.has(item.metadata) &&
          !toEmbed.some((e) => e.id === item.id)
      );

      for (const item of additionalItems) {
        resultMap.delete(item.id);
        if (this.vectors.has(item.id)) {
          this.vectors.delete(item.id);
        }
      }

      toEmbed.push(...additionalItems);
    }

    if (toEmbed.length === 0) {
      return ebdTexts.map((item) => resultMap.get(item.id));
    }

    // Chunking array
    const chunkSize = await this.getOptimalChunkSize();

    // Debug log for optimal chunk size
    console.debug(
      HypaProcessorV2.LOG_PREFIX,
      `Optimal chunk size for ${this.options.model}: ${chunkSize}`
    );

    const chunks = this.chunkArray(toEmbed, chunkSize);

    if (this.options.model === 'voyageContext3' && saveToMemory) {
      const db = getDatabase();
      const apiKey = db.voyageApiKey?.trim();
      if (!apiKey) {
        throw new Error('Voyage Context 3 requires a Voyage API Key');
      }

      const metadataGroups = new Map<TMetadata, EmbeddingText<TMetadata>[]>();
      for (const item of toEmbed) {
        const key = item.metadata;
        const group = metadataGroups.get(key) || [];
        group.push(item);
        metadataGroups.set(key, group);
      }

      const groupEntries = Array.from(metadataGroups.entries());

      const MAX_CHUNKS = 16000;
      const MAX_INPUTS = 1000;
      const batches: [TMetadata, EmbeddingText<TMetadata>[]][][] = [];
      let currentBatch: [TMetadata, EmbeddingText<TMetadata>[]][] = [];
      let currentChunkCount = 0;

      for (const entry of groupEntries) {
        const groupSize = entry[1].length;
        if (
          currentBatch.length > 0 &&
          (currentBatch.length + 1 > MAX_INPUTS ||
           currentChunkCount + groupSize > MAX_CHUNKS)
        ) {
          batches.push(currentBatch);
          currentBatch = [];
          currentChunkCount = 0;
        }
        currentBatch.push(entry);
        currentChunkCount += groupSize;
      }
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      for (const batch of batches) {
        const input = batch.map(([, group]) =>
          group.map((item) => item.content)
        );

        const response = await globalFetch(
          "https://api.voyageai.com/v1/contextualizedembeddings",
          {
            headers: {
              "Authorization": "Bearer " + apiKey,
              "Content-Type": "application/json"
            },
            body: {
              "model": "voyage-context-3",
              "input": input,
              "input_type": "document"
            }
          }
        );

        if (!response.ok || !response.data.data) {
          throw new Error(JSON.stringify(response.data));
        }

        for (let i = 0; i < batch.length; i++) {
          const [, group] = batch[i];
          const groupEmbeddings = response.data.data[i].data;

          for (let j = 0; j < group.length; j++) {
            const { id, content, metadata } = group[j];
            const embedding = groupEmbeddings[j].embedding;

            const ebdResult: EmbeddingResult<TMetadata> = {
              id, content, embedding, metadata
            };

            await this.forage.setItem(this.getCacheKey(content), {
              content, embedding
            });

            if (saveToMemory) {
              this.vectors.set(id, ebdResult);
            }

            resultMap.set(id, ebdResult);
          }
        }
      }
    } else if (this.isLocalModel()) {
      // Local model: Sequential processing
      for (let i = 0; i < chunks.length; i++) {
        // Progress callback
        this.progressCallback?.(chunks.length - i - 1);

        const chunk = chunks[i];
        const embeddings = await this.getLocalEmbeds(
          chunk.map((item) => item.content)
        );

        const savePromises = embeddings.map(async (embedding, j) => {
          const { id, content, metadata } = chunk[j];

          const ebdResult: EmbeddingResult<TMetadata> = {
            id,
            content,
            embedding,
            metadata,
          };

          // Save to DB
          await this.forage.setItem(this.getCacheKey(content), {
            content,
            embedding,
          });

          // Save to memory
          if (saveToMemory) {
            this.vectors.set(id, ebdResult);
          }

          resultMap.set(id, ebdResult);
        });

        await Promise.all(savePromises);
      }
    } else {
      // API model: Parallel processing
      const embeddingTasks = chunks.map((chunk) => {
        const contents = chunk.map((item) => item.content);

        return () => this.getAPIEmbeds(contents);
      });

      // Progress callback
      this.options.rateLimiter.taskQueueChangeCallback = this.progressCallback;

      const batchResult = await this.options.rateLimiter.executeBatch<
        EmbeddingVector[]
      >(embeddingTasks);
      const errors: Error[] = [];

      const chunksSavePromises = batchResult.results.map(async (result, i) => {
        if (!result.success) {
          errors.push(result.error);
          return;
        }

        if (!result.data) {
          errors.push(new Error("No embeddings found in the response."));
          return;
        }

        const chunk = chunks[i];
        const savePromises = result.data.map(async (embedding, j) => {
          const { id, content, metadata } = chunk[j];

          const ebdResult: EmbeddingResult<TMetadata> = {
            id,
            content,
            embedding,
            metadata,
          };

          // Save to DB
          await this.forage.setItem(this.getCacheKey(content), {
            content,
            embedding,
          });

          // Save to memory
          if (saveToMemory) {
            this.vectors.set(id, ebdResult);
          }

          resultMap.set(id, ebdResult);
        });

        await Promise.all(savePromises);
      });

      await Promise.all(chunksSavePromises);

      // Throw major error if there are errors
      if (errors.length > 0) {
        const majorError =
          errors.find((error) => !(error instanceof TaskCanceledError)) ||
          errors[0];

        throw majorError;
      }
    }

    return ebdTexts.map((item) => resultMap.get(item.id));
  }

  private similarity(a: EmbeddingVector, b: EmbeddingVector): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  private getCacheKey(content: string): string {
    const db = getDatabase();
    const suffix =
      this.options.model === "custom" && db.hypaCustomSettings?.model?.trim()
        ? `-${db.hypaCustomSettings.model.trim()}`
        : "";

    return `${content}|${this.options.model}${suffix}`;
  }

  private getOptimalChunkSize(): number {
    // API
    if (!this.isLocalModel()) {
      return 50;
    }

    // WebGPU
    if ("gpu" in navigator) {
      return isMobile ? 5 : 10;
    }

    // WASM
    const cpuCores = navigator.hardwareConcurrency || 4;
    const baseChunkSize = isMobile ? Math.floor(cpuCores / 2) : cpuCores;

    return Math.min(baseChunkSize, 10);
  }

  private isLocalModel(): boolean {
    return Object.keys(localModels.models).includes(this.options.model);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }

    return chunks;
  }

  private async getLocalEmbeds(contents: string[]): Promise<EmbeddingVector[]> {
    const results: Float32Array[] = await runEmbedding(
      contents,
      localModels.models[this.options.model],
      localModels.gpuModels.includes(this.options.model) ? "webgpu" : "wasm"
    );

    return results;
  }

  private async getAPIEmbeds(contents: string[]): Promise<EmbeddingVector[]> {
    const db = getDatabase();
    let response = null;

    if (this.options.model === "custom") {
      if (!this.options.customEmbeddingUrl) {
        throw new Error("Custom model requires a Custom Server URL");
      }

      const replaceUrl = this.options.customEmbeddingUrl.endsWith("/embeddings")
        ? this.options.customEmbeddingUrl
        : appendLastPath(this.options.customEmbeddingUrl, "embeddings");

      const fetchArgs = {
        headers: {
          ...(db.hypaCustomSettings?.key?.trim()
            ? { Authorization: "Bearer " + db.hypaCustomSettings.key.trim() }
            : {}),
        },
        body: {
          input: contents,
          ...(db.hypaCustomSettings?.model?.trim()
            ? { model: db.hypaCustomSettings.model.trim() }
            : {}),
        },
      };

      response = await globalFetch(replaceUrl, fetchArgs);
    } else if (
      ["ada", "openai3small", "openai3large"].includes(this.options.model)
    ) {
      const models = {
        ada: "text-embedding-ada-002",
        openai3small: "text-embedding-3-small",
        openai3large: "text-embedding-3-large",
      };

      const fetchArgs = {
        headers: {
          Authorization:
            "Bearer " +
            (this.options.oaiKey?.trim() || db.supaMemoryKey?.trim()),
        },
        body: {
          input: contents,
          model: models[this.options.model],
        },
      };

      response = await globalFetch(
        "https://api.openai.com/v1/embeddings",
        fetchArgs
      );
    } else if (this.options.model === 'voyageContext3') {
      const apiKey = db.voyageApiKey?.trim();
      if (!apiKey) {
        throw new Error('Voyage Context 3 requires a Voyage API Key');
      }

      response = await globalFetch(
        "https://api.voyageai.com/v1/embeddings",
        {
          headers: {
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
          },
          body: {
            "input": contents,
            "model": "voyage-context-3",
            "input_type": "query"
          }
        }
      );
    } else {
      throw new Error(`Unsupported model: ${this.options.model}`);
    }

    if (!response.ok || !response.data.data) {
      throw new Error(JSON.stringify(response.data));
    }

    const embeddings: EmbeddingVector[] = response.data.data.map(
      (item: { embedding: EmbeddingVector }) => {
        if (!item.embedding) {
          throw new Error("No embeddings found in the response.");
        }

        return item.embedding;
      }
    );

    return embeddings;
  }
}
