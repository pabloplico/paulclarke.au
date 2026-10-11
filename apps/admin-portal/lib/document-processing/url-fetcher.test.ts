import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPrivateIp, validateUrl } from './url-fetcher';

// Mock dns.promises.lookup
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';

const mockLookup = vi.mocked(lookup);

describe('isPrivateIp', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.0.0.254', true],
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.15.0.1', false],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['::1', true],
    ['fc00::1', true],
    ['fe80::1', true],
    ['2001:4860:4860::8888', false],
  ])('isPrivateIp(%s) === %s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('validateUrl', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('rejects ftp:// scheme', async () => {
    await expect(validateUrl('ftp://example.com/file')).rejects.toThrow('scheme');
  });

  it('rejects file:// scheme', async () => {
    await expect(validateUrl('file:///etc/passwd')).rejects.toThrow('scheme');
  });

  it('rejects javascript: scheme', async () => {
    await expect(validateUrl('javascript:alert(1)')).rejects.toThrow('scheme');
  });

  it('rejects http://127.0.0.1', async () => {
    await expect(validateUrl('http://127.0.0.1/admin')).rejects.toThrow('private');
  });

  it('rejects http://169.254.169.254 (cloud metadata)', async () => {
    await expect(validateUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      'private'
    );
  });

  it('rejects metadata.google.internal', async () => {
    await expect(validateUrl('http://metadata.google.internal/')).rejects.toThrow('blocked');
  });

  it('rejects http://[::1]', async () => {
    await expect(validateUrl('http://[::1]/secret')).rejects.toThrow('private');
  });

  it('rejects http://192.168.1.1:8080', async () => {
    await expect(validateUrl('http://192.168.1.1:8080/api')).rejects.toThrow('private');
  });

  it('rejects http://localhost', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(validateUrl('http://localhost:3000')).rejects.toThrow('private');
  });

  it('allows https://example.com with public IP', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    await expect(validateUrl('https://example.com/page')).resolves.toBeUndefined();
  });

  it('rejects DNS rebinding (hostname resolves to private IP)', async () => {
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(validateUrl('http://evil.com')).rejects.toThrow('private');
  });

  it('rejects empty URL string', async () => {
    await expect(validateUrl('')).rejects.toThrow();
  });

  it('rejects malformed URL', async () => {
    await expect(validateUrl('not-a-url')).rejects.toThrow();
  });
});
