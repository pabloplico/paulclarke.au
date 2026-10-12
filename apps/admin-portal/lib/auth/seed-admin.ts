import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { adminUsers } from '@/lib/db/schema';
import { hashPassword } from './index';
import { isValidEmail, validatePassword } from './validation';

export type SeedAdminResult = {
  email: string;
  created: boolean;
  /** Set only when no password was given and one was generated. */
  generatedPassword?: string;
};

/**
 * Creates the admin account, the only way to get the admin role. The email
 * is required; with no password, a random one is generated and returned so
 * the caller can show it once. There is no default password.
 */
export async function seedAdminUser(options: {
  email: string | undefined;
  password?: string;
  name?: string;
}): Promise<SeedAdminResult> {
  const email = options.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    throw new Error('ADMIN_EMAIL is required and must be a valid email address');
  }

  let generatedPassword: string | undefined;
  let password = options.password;
  if (password) {
    const check = validatePassword(password);
    if (!check.valid) throw new Error(`ADMIN_PASSWORD is too weak: ${check.message}`);
  } else {
    // 24 random characters; redrawn in the rare case it fails the app's own rules
    do {
      generatedPassword = randomBytes(18).toString('base64url');
    } while (!validatePassword(generatedPassword).valid);
    password = generatedPassword;
  }

  const [user] = await db
    .insert(adminUsers)
    .values({
      email,
      passwordHash: await hashPassword(password),
      name: options.name?.trim() || 'Admin',
      role: 'admin',
    })
    .onConflictDoNothing({ target: adminUsers.email })
    .returning({ id: adminUsers.id });

  return user ? { email, created: true, generatedPassword } : { email, created: false };
}
