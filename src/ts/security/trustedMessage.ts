/** Accept messages only from the window opened for the expected URL. */
export function isMessageFromWindow(
    event: Pick<MessageEvent, 'origin' | 'source'>,
    expectedWindow: Window | null | undefined,
    expectedUrl: string,
): boolean {
    return (
        !!expectedWindow &&
        event.source === expectedWindow &&
        event.origin === new URL(expectedUrl, window.location.href).origin
    )
}
