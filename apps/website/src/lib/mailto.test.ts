import { describe, expect, it } from 'vitest';
import { buildContactMailto, CONTACT_EMAIL } from './mailto';

/** Decode a mailto: URL back into its parts for readable assertions. */
function parse(mailto: string) {
  const url = new URL(mailto);
  return {
    to: url.pathname,
    subject: url.searchParams.get('subject'),
    body: url.searchParams.get('body'),
  };
}

const form = { name: 'Sam Lee', email: 'sam@example.com', company: '', message: 'Hello there' };

describe('buildContactMailto', () => {
  it('addresses the contact email by default', () => {
    expect(parse(buildContactMailto(form)).to).toBe(CONTACT_EMAIL);
  });

  it('puts the details, a blank line, then the message in the body', () => {
    expect(parse(buildContactMailto(form)).body).toBe(
      'Name: Sam Lee\nEmail: sam@example.com\n\nHello there'
    );
  });

  it('adds the company to the subject and body only when given', () => {
    expect(parse(buildContactMailto(form)).subject).toBe('Website enquiry');

    const withCompany = parse(buildContactMailto({ ...form, company: '  Acme  ' }));
    expect(withCompany.subject).toBe('Website enquiry — Acme');
    expect(withCompany.body).toContain('Company: Acme\n\nHello there');
  });

  it('encodes characters that would otherwise break the URL', () => {
    const url = buildContactMailto({ ...form, message: 'Q&A? 50% off #1' });
    expect(url).not.toContain('Q&A');
    expect(parse(url).body).toContain('Q&A? 50% off #1');
  });
});
