import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('src/ts/globalApi.svelte', () => ({ globalFetch: vi.fn() }))
vi.mock('src/ts/storage/database.svelte', () => ({ getDatabase: () => ({ voyageApiKey: 'k' }) }))
vi.mock('src/ts/tokenizer', () => ({ countVoyageTokens: vi.fn() }))
vi.mock('./hypamemory', () => ({ contextHash: vi.fn() }))

import { globalFetch } from 'src/ts/globalApi.svelte'
import { countVoyageTokens } from 'src/ts/tokenizer'
import { getContextProvider } from './contextualEmbedding'

describe('contextual embedding document batches', () => {
  beforeEach(() => {
    vi.mocked(globalFetch).mockReset()
    vi.mocked(countVoyageTokens).mockReset()
  })

  test.each([
    { name: 'splits groups at the token budget', g0a: 30_000, g0b: 30_000, g1: 60_000, g2: 5_000 },
    { name: 'sends an oversized group alone', g0a: 100_000, g0b: 100_000, g1: 1_000, g2: 1_000 }
  ])('$name and preserves group and chunk order', async ({ name, ...counts }) => {
    const groups = [['g0a', 'g0b'], ['g1'], ['g2']]
    const markers = { g0a: 0, g0b: 1, g1: 2, g2: 3 }
    vi.mocked(countVoyageTokens).mockImplementation(async text => counts[text])
    vi.mocked(globalFetch).mockImplementation(async (_url, args) => ({
      ok: true,
      data: {
        data: args.body.inputs.map((group: string[]) => ({
          data: group.map(text => ({ embedding: [markers[text]] }))
        }))
      }
    }) as any)

    const result = await getContextProvider('voyageContext3').embedDocumentGroups(groups)

    expect(vi.mocked(globalFetch).mock.calls.map(([, args]) => args.body.inputs))
      .toEqual([[groups[0]], [groups[1], groups[2]]])
    expect(result).toEqual([[[0], [1]], [[2]], [[3]]])
  })
})
