import { describe, expect, it } from 'vitest'
import { isMessageFromWindow } from './trustedMessage'

describe('isMessageFromWindow', () => {
    const loginWindow = {} as Window
    const otherWindow = {} as Window

    it('accepts the expected login window and exact origin', () => {
        expect(
            isMessageFromWindow(
                { origin: 'https://sv.risuai.xyz', source: loginWindow },
                loginWindow,
                'https://sv.risuai.xyz/hub/login',
            ),
        ).toBe(true)
    })

    it('rejects an attacker-controlled origin with the trusted prefix', () => {
        expect(
            isMessageFromWindow(
                {
                    origin: 'https://sv.risuai.xyz.attacker.example',
                    source: loginWindow,
                },
                loginWindow,
                'https://sv.risuai.xyz/hub/login',
            ),
        ).toBe(false)
    })

    it('rejects another window even when the origin matches', () => {
        expect(
            isMessageFromWindow(
                { origin: 'https://sv.risuai.xyz', source: otherWindow },
                loginWindow,
                'https://sv.risuai.xyz/hub/login',
            ),
        ).toBe(false)
    })

    it('accepts the Node server login iframe on the current origin', () => {
        expect(
            isMessageFromWindow(
                { origin: window.location.origin, source: loginWindow },
                loginWindow,
                '/hub-proxy/hub/login',
            ),
        ).toBe(true)
    })

    it('rejects messages when no login window is active', () => {
        expect(
            isMessageFromWindow(
                { origin: 'https://sv.risuai.xyz', source: loginWindow },
                null,
                'https://sv.risuai.xyz/hub/login',
            ),
        ).toBe(false)
    })
})
