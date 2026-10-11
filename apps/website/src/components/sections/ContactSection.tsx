import { Button } from '@repo/ui/button';
import { Input } from '@repo/ui/input';
import { Textarea } from '@repo/ui/textarea';
import { Mail, MapPin, Send } from 'lucide-react';
import { useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { buildContactMailto, CONTACT_EMAIL, type ContactForm } from '@/lib/mailto';

const EMPTY_FORM: ContactForm = { name: '', email: '', company: '', message: '' };

export function ContactSection() {
  useDocumentTitle('Contact');
  const [formState, setFormState] = useState<ContactForm>(EMPTY_FORM);
  const [opened, setOpened] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    window.location.href = buildContactMailto(formState);
    setOpened(true);
  };

  return (
    <section className="pt-20 md:pt-32 pb-16 relative">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="mb-16 relative">
        <span className="font-label text-primary tracking-[0.2em] text-xs uppercase mb-6 block">
          Contact
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter leading-tight mb-6">
          Get in Touch
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {opened ? (
            <div className="rounded-xl bg-card border border-white/10 glass p-8 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-status-online/10 flex items-center justify-center mx-auto">
                <Send aria-hidden="true" className="h-6 w-6 text-status-online" />
              </div>
              <h2 className="text-lg font-semibold">Email client opened</h2>
              <p className="text-sm text-muted-foreground">
                Your default mail app should now have the message ready to send. If nothing
                happened, email me directly at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setOpened(false);
                  setFormState(EMPTY_FORM);
                }}
                className="mt-4 border-white/15"
              >
                Compose another
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-xl bg-card border border-white/10 glass p-8 space-y-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="contact-name" className="text-sm font-medium">
                    Name
                  </label>
                  <Input
                    id="contact-name"
                    required
                    placeholder="Your name"
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="contact-email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="contact-email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-company" className="text-sm font-medium">
                  Company <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="contact-company"
                  placeholder="Your company"
                  value={formState.company}
                  onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact-message" className="text-sm font-medium">
                  Message
                </label>
                <Textarea
                  id="contact-message"
                  required
                  placeholder="Tell me about your project or what you're looking for..."
                  value={formState.message}
                  onChange={(e) => setFormState({ ...formState, message: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sending opens your email app with the message pre-filled — nothing leaves your
                device until you hit send there.
              </p>
              <Button
                type="submit"
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Send size={16} aria-hidden="true" /> Open in email
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl bg-card border border-white/10 glass p-6 space-y-5">
            <h2 className="font-semibold">Contact Details</h2>
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Mail aria-hidden="true" className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Email</p>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="text-muted-foreground hover:text-foreground transition-colors break-all"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin aria-hidden="true" className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Location</p>
                  <p className="text-muted-foreground">Brisbane, Queensland, Australia</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
