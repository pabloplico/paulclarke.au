import { describe, expect, it } from 'vitest';
import { isValidAbn } from './abn-validation';

describe('isValidAbn', () => {
  it('validates a correct ABN', () => {
    // Australian Taxation Office ABN
    expect(isValidAbn('51824753556')).toBe(true);
  });

  it('accepts ABN with spaces', () => {
    expect(isValidAbn('51 824 753 556')).toBe(true);
  });

  it('rejects ABN with wrong length', () => {
    expect(isValidAbn('1234567890')).toBe(false); // 10 digits
    expect(isValidAbn('123456789012')).toBe(false); // 12 digits
  });

  it('rejects ABN with non-digit characters', () => {
    expect(isValidAbn('5182475355a')).toBe(false);
    expect(isValidAbn('abcdefghijk')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidAbn('')).toBe(false);
  });

  it('rejects ABN with invalid checksum', () => {
    expect(isValidAbn('51824753557')).toBe(false); // last digit wrong
    expect(isValidAbn('00000000000')).toBe(false);
  });
});
