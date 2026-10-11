import { describe, expect, it } from 'vitest';
import { isValidEmail, validatePassword } from './validation';

describe('isValidEmail', () => {
  it.each([
    ['user@example.com', true],
    ['user+tag@example.com', true],
    ['a@b.co', true],
  ])('accepts valid email: %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });

  it.each([
    ['foo', false],
    ['@example.com', false],
    ['user@', false],
    ['a@b', false],
    ['', false],
    ['user @example.com', false],
    ['user@exam ple.com', false],
  ])('rejects invalid email: %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe('validatePassword', () => {
  it('accepts a password meeting all requirements', () => {
    expect(validatePassword('Passw0rd')).toEqual({ valid: true, message: '' });
  });

  it('accepts 8 chars with letter + digit', () => {
    expect(validatePassword('abcdefg1')).toEqual({ valid: true, message: '' });
  });

  it('rejects all-digit password', () => {
    const result = validatePassword('12345678');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('letter');
  });

  it('rejects all-letter password', () => {
    const result = validatePassword('abcdefgh');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('digit');
  });

  it('rejects password shorter than 8 characters', () => {
    const result = validatePassword('Ab1');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('8 characters');
  });

  it('rejects old 6-char minimum password', () => {
    const result = validatePassword('aaaaaa');
    expect(result.valid).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('8 characters');
  });
});
