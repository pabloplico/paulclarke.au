export const CONTACT_EMAIL = 'hello@paulclarke.au';

export interface ContactForm {
  name: string;
  email: string;
  company: string;
  message: string;
}

/** Build the mailto: URL the contact form opens. Nothing is sent from the site itself. */
export function buildContactMailto(form: ContactForm, to: string = CONTACT_EMAIL): string {
  const company = form.company.trim();
  const subject = `Website enquiry${company ? ` — ${company}` : ''}`;
  const details = [`Name: ${form.name}`, `Email: ${form.email}`];
  if (company) details.push(`Company: ${company}`);
  // Blank line between the details and the message
  const body = `${details.join('\n')}\n\n${form.message}`;

  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
