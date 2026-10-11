const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Check whether an email string has a valid format (local@domain.tld). */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export const PASSWORD_REQUIREMENTS =
  'Password must be at least 8 characters and contain at least one letter and one digit.';

/**
 * Validate a password against the password policy.
 *
 * Rules:
 * - Minimum 8 characters
 * - At least one letter [a-zA-Z]
 * - At least one digit [0-9]
 */
export function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one digit.' };
  }
  return { valid: true, message: '' };
}
