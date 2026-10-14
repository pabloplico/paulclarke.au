import { afterEach, describe, expect, it } from 'vitest';
import { runStartupChecks } from './startup-checks';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function env(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

describe('runStartupChecks', () => {
  it('passes the dev setup with nothing set', () => {
    env({ DEMO_MODE: undefined, DEV_ACCESS_IDENTITY: undefined });
    expect(() => runStartupChecks()).not.toThrow();
  });

  it('refuses DEV_ACCESS_IDENTITY in production', () => {
    env({ DEV_ACCESS_IDENTITY: 'dev@localhost.test', NODE_ENV: 'production' });
    expect(() => runStartupChecks()).toThrow('DEV_ACCESS_IDENTITY');
  });

  it('refuses demo mode without the Access config', () => {
    env({ DEMO_MODE: 'true', CF_ACCESS_TEAM_DOMAIN: undefined, CF_ACCESS_AUD: undefined });
    expect(() => runStartupChecks()).toThrow('CF_ACCESS_TEAM_DOMAIN');
  });

  it('refuses demo mode when the AI provider, model and key don’t line up', () => {
    env({
      DEMO_MODE: 'true',
      CF_ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com',
      CF_ACCESS_AUD: 'aud',
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-4.1-nano',
      OPENAI_API_KEY: undefined,
    });
    expect(() => runStartupChecks()).toThrow(
      'AI configuration: AI_PROVIDER=openai needs OPENAI_API_KEY.'
    );
  });

  it('only warns about the AI config in development', () => {
    env({
      DEMO_MODE: undefined,
      NODE_ENV: 'development',
      AI_PROVIDER: 'gemini',
      AI_MODEL: 'claude-sonnet-4-6',
    });
    expect(() => runStartupChecks()).not.toThrow();
  });

  it('refuses demo mode with AUTH_ENABLED=false', () => {
    env({
      DEMO_MODE: 'true',
      AUTH_ENABLED: 'false',
      CF_ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com',
      CF_ACCESS_AUD: 'aud',
    });
    expect(() => runStartupChecks()).toThrow('AUTH_ENABLED=false');
  });

  it('passes a complete demo config', () => {
    env({
      DEMO_MODE: 'true',
      AUTH_ENABLED: undefined,
      CF_ACCESS_TEAM_DOMAIN: 'https://t.cloudflareaccess.com',
      CF_ACCESS_AUD: 'aud',
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-4.1-nano',
      OPENAI_API_KEY: 'sk-test',
    });
    expect(() => runStartupChecks()).not.toThrow();
  });
});
