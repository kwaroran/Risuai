import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../alert', () => ({ alertError: vi.fn() }))
vi.mock('../../../globalApi.svelte', () => ({ fetchNative: vi.fn(), globalFetch: vi.fn(), readImage: vi.fn() }))
vi.mock('../../../kei/kei', () => ({ keiServerURL: vi.fn(() => 'https://kei.test') }))
vi.mock('../../../storage/database.svelte', () => ({ getDatabase: vi.fn() }))
vi.mock('../../../stores.svelte', async () => {
  const { writable } = await import('svelte/store')
  return { CharEmotion: writable({}) }
})
vi.mock('../../processzip', () => ({ processZip: vi.fn() }))
vi.mock('../request', () => ({ requestChatData: vi.fn() }))
vi.mock('lodash/random', () => ({ default: vi.fn(() => 7) }))

import { alertError } from '../../../alert'
import { fetchNative, globalFetch } from '../../../globalApi.svelte'
import { getDatabase, type character, type Database } from '../../../storage/database.svelte'
import { CharEmotion } from '../../../stores.svelte'
import { processZip } from '../../processzip'
import { generateAIImage } from './index'

type Expectation = 'falseOnFailure' | 'falseOnInlayFailure' | 'storesOutsideInlay'

interface ProviderCase {
  db: Record<string, unknown>
  image: string
  mockFailure: () => void
  mockSuccess: () => void
  /** TODO: Expectations the provider does not meet yet. Their tests are expected to fail. */
  todo?: Expectation[]
}

const NOW = 1000

const char = { chaId: 'char1', image: 'char.png' } as character

const fetchMock = vi.fn<typeof fetch>()

function bytes(text: string) {
  return new TextEncoder().encode(text)
}

function base64(text: string) {
  return Buffer.from(text).toString('base64')
}

function mockGlobalFetch(...responses: unknown[]) {
  for (const response of responses) {
    vi.mocked(globalFetch).mockResolvedValueOnce(response as Awaited<ReturnType<typeof globalFetch>>)
  }
}

function sentRequests() {
  const fetchCalls = fetchMock.mock.calls.map(([url, init]) => [
    url,
    { ...init, body: Object.fromEntries((init.body as FormData).entries()) },
  ])
  return {
    fetch: fetchCalls,
    fetchNative: vi.mocked(fetchNative).mock.calls,
    globalFetch: vi.mocked(globalFetch).mock.calls,
  }
}

const comfyHistory = { p1: { outputs: { 9: { images: [{ filename: 'a.png', subfolder: 'sub', type: 'output' }] } } } }

function mockComfySuccess() {
  mockGlobalFetch({ data: { prompt_id: 'p1' }, ok: true })
  vi.mocked(fetchNative).mockImplementation(async (url) => {
    if (url.includes('/history')) {
      return Response.json(comfyHistory)
    }
    return new Response(bytes('img'))
  })
}

const comfyWorkflow = JSON.stringify({
  1: { inputs: { text: '{{risu_prompt}}' } },
  2: { inputs: { text: '{{risu_neg}}' } },
  3: { inputs: { seed: 1, steps: 20 } },
})

const cases: Record<string, ProviderCase> = {
  comfy: {
    db: {
      comfyConfig: { negInputName: 'text', negNodeID: '2', posInputName: 'text', posNodeID: '1', timeout: 30, workflow: comfyWorkflow },
      comfyUiUrl: 'http://comfy.test',
    },
    image: `data:image/png;base64,${base64('img')}`,
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: mockComfySuccess,
  },
  comfyui: {
    db: {
      comfyConfig: { timeout: 30, workflow: comfyWorkflow },
      comfyUiUrl: 'http://comfy.test/api',
    },
    image: `data:image/png;base64,${base64('img')}`,
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: mockComfySuccess,
  },
  dalle: {
    db: { dallEQuality: 'hd', openAIKey: 'openai-key' },
    image: 'data:image/png;base64,AAA',
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: () => mockGlobalFetch({ data: { data: [{ b64_json: 'AAA' }] }, ok: true }),
    todo: ['falseOnFailure', 'falseOnInlayFailure'],
  },
  fal: {
    db: {
      falLora: 'urn:air:flux1:lora:civitai:1@2345',
      falLoraScale: 0.8,
      falModel: 'fal-ai/flux-lora',
      falToken: 'fal-token',
      sdConfig: { height: 768, width: 512 },
    },
    image: 'https://fal.test/img.png',
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: () => mockGlobalFetch({ data: { images: [{ url: 'https://fal.test/img.png' }] }, ok: true }),
  },
  Imagen: {
    db: {
      google: { accessToken: 'google-key' },
      ImagenAspectRatio: '16:9',
      ImagenImageSize: '2K',
      ImagenModel: 'imagen-4.0-generate-001',
      ImagenPersonGeneration: 'allow_adult',
    },
    image: 'data:image/jpeg;base64,AAA',
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: () => mockGlobalFetch({ data: { predictions: [{ bytesBase64Encoded: 'AAA', mimeType: 'image/jpeg' }] }, ok: true }),
    todo: ['storesOutsideInlay'],
  },
  kei: {
    db: { account: { token: 'kei-token' } },
    image: 'data:image/png;base64,KEI',
    mockFailure: () => mockGlobalFetch({ data: { message: 'no credits', success: false }, ok: true }),
    mockSuccess: () => mockGlobalFetch({ data: { data: 'data:image/png;base64,KEI', success: true }, ok: true }),
  },
  novelai: {
    db: {
      NAII2I: false,
      NAIApiKey: 'nai-key',
      NAIImgConfig: {
        cfg_rescale: 0,
        decrisp: false,
        height: 1216,
        legacy_uc: false,
        noise_schedule: 'karras',
        sampler: 'k_euler_ancestral',
        scale: 5,
        sm: false,
        sm_dyn: false,
        steps: 28,
        width: 832,
      },
      NAIImgModel: 'nai-diffusion-4-5-full',
      NAIImgUrl: 'https://image.novelai.test/generate',
    },
    image: 'data:image/png;base64,ZIP',
    mockFailure: () => mockGlobalFetch({ data: bytes('denied'), ok: false }),
    mockSuccess: () => {
      mockGlobalFetch({ data: bytes('zip'), ok: true })
      vi.mocked(processZip).mockResolvedValue('data:image/png;base64,ZIP')
    },
    todo: ['falseOnInlayFailure'],
  },
  'openai-compat': {
    db: { openaiCompatImage: { key: 'compat-key', model: 'gpt-image-1', quality: '', size: '', url: 'https://compat.test/images' } },
    image: 'data:image/png;base64,AAA',
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: () => mockGlobalFetch({ data: { data: [{ b64_json: 'AAA' }] }, ok: true }),
    todo: ['falseOnInlayFailure'],
  },
  stability: {
    db: { stabilityKey: 'stab-key', stabilityModel: 'sd3-large' },
    image: `data:image/png;base64,${base64('img')}`,
    mockFailure: () => fetchMock.mockResolvedValue(new Response(bytes('denied'), { status: 403 })),
    mockSuccess: () => fetchMock.mockResolvedValue(new Response(bytes('img'), { headers: { 'content-type': 'image/png' } })),
  },
  wavespeed: {
    db: { wavespeedImage: { key: 'ws-key', loras: [{ path: 'lora-a', scale: 0.5 }], model: 'bytedance/seedream' } },
    image: `data:image/webp;base64,${base64('img')}`,
    mockFailure: () => mockGlobalFetch({ data: 'bad', ok: false, status: 400 }),
    mockSuccess: () => mockGlobalFetch(
      { data: { data: { id: 't1' } }, ok: true },
      { data: { data: { outputs: ['https://ws.test/out.webp'], status: 'completed' } }, ok: true },
      { data: bytes('img'), headers: { 'content-type': 'image/webp' }, ok: true },
    ),
  },
  webui: {
    db: {
      sdCFG: 7,
      sdConfig: { denoising_strength: 0.5, enable_hr: false, height: 768, hr_scale: 2, hr_upscaler: 'Latent', sampler_name: 'Euler a', width: 512 },
      sdSteps: 20,
      webUiUrl: 'http://sd.test',
    },
    image: 'data:image/png;base64,AAA',
    mockFailure: () => mockGlobalFetch({ data: { error: 'bad' }, ok: false }),
    mockSuccess: () => mockGlobalFetch({ data: { images: ['AAA'] }, ok: true }),
    todo: ['falseOnInlayFailure'],
  },
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  vi.stubGlobal('fetch', fetchMock)
  CharEmotion.set({})
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each(Object.entries(cases))('%s', (provider, { db, image, mockFailure, mockSuccess, todo = [] }) => {
  const testUnlessTodo = (expectation: Expectation) => todo.includes(expectation) ? test.fails : test

  beforeEach(() => {
    vi.mocked(getDatabase).mockReturnValue({ ...db, sdProvider: provider } as unknown as Database)
  })

  test('sends the provider request', async () => {
    mockSuccess()
    await generateAIImage('a cat', char, 'blurry', 'inlay')

    expect(sentRequests()).toMatchSnapshot()
  })

  test('returns the image in inlay mode', async () => {
    mockSuccess()

    expect(await generateAIImage('a cat', char, 'blurry', 'inlay')).toBe(image)
    expect(get(CharEmotion)[char.chaId]).toBeUndefined()
  })

  testUnlessTodo('storesOutsideInlay')('stores the image outside inlay mode', async () => {
    mockSuccess()
    await generateAIImage('a cat', char, 'blurry', '')

    expect(get(CharEmotion)[char.chaId]).toEqual([[image, image, NOW]])
  })

  testUnlessTodo('falseOnInlayFailure')('returns false and alerts on failure in inlay mode', async () => {
    mockFailure()

    expect(await generateAIImage('a cat', char, 'blurry', 'inlay')).toBe(false)
    expect(alertError).toHaveBeenCalled()
  })

  testUnlessTodo('falseOnFailure')('returns false and alerts on failure outside inlay mode', async () => {
    mockFailure()

    expect(await generateAIImage('a cat', char, 'blurry', '')).toBe(false)
    expect(alertError).toHaveBeenCalled()
  })
})
