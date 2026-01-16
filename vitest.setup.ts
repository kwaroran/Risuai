import { vi } from 'vitest'

// Suppress warning
vi.mock(import('katex'), () => ({}))

vi.stubGlobal('safeStructuredClone', (v: unknown) => JSON.parse(JSON.stringify(v)))
