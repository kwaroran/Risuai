import { expect, test } from 'vitest';
import { isLocalNetworkHost, isLocalNetworkUrl } from './localNetwork';

test('detects localhost variants', () => {
    expect(isLocalNetworkHost('localhost')).toBe(true);
    expect(isLocalNetworkHost('127.0.0.1')).toBe(true);
    expect(isLocalNetworkHost('0.0.0.0')).toBe(true);
    expect(isLocalNetworkHost('::1')).toBe(true);
});

test('detects private and link-local IPv4 ranges', () => {
    expect(isLocalNetworkHost('10.20.30.40')).toBe(true);
    expect(isLocalNetworkHost('172.16.0.1')).toBe(true);
    expect(isLocalNetworkHost('172.31.255.254')).toBe(true);
    expect(isLocalNetworkHost('192.168.0.1')).toBe(true);
    expect(isLocalNetworkHost('169.254.10.20')).toBe(true);
});

test('rejects public IPv4 ranges', () => {
    expect(isLocalNetworkHost('172.15.0.1')).toBe(false);
    expect(isLocalNetworkHost('172.32.0.1')).toBe(false);
    expect(isLocalNetworkHost('8.8.8.8')).toBe(false);
});

test('detects private and link-local IPv6 ranges', () => {
    expect(isLocalNetworkHost('fc00::1')).toBe(true);
    expect(isLocalNetworkHost('fd12:3456:789a::1')).toBe(true);
    expect(isLocalNetworkHost('fe80::1234')).toBe(true);
});

test('rejects public IPv6 ranges', () => {
    expect(isLocalNetworkHost('2001:4860:4860::8888')).toBe(false);
});

test('detects .local hostname suffix', () => {
    expect(isLocalNetworkHost('printer.local')).toBe(true);
    expect(isLocalNetworkHost('MACHINE.LOCAL')).toBe(true);
});

test('isLocalNetworkUrl handles local and public URLs', () => {
    expect(isLocalNetworkUrl('http://192.168.0.140:11435/v1')).toBe(true);
    expect(isLocalNetworkUrl('http://[fe80::1]/v1')).toBe(true);
    expect(isLocalNetworkUrl('https://example.com/v1')).toBe(false);
});

test('isLocalNetworkUrl rejects invalid URLs', () => {
    expect(isLocalNetworkUrl('not-a-valid-url')).toBe(false);
});

