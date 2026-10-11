import { Github, Linkedin } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const LINKS = [
  { label: 'GitHub', href: 'https://github.com/pabloplico', icon: Github },
  { label: 'LinkedIn', href: 'https://linkedin.com/in/paul-clarke-70959541', icon: Linkedin },
];

export function AboutSection() {
  useDocumentTitle('About');

  return (
    <section className="pt-20 md:pt-32 pb-16 relative">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="mb-16 relative">
        <span className="font-label text-primary tracking-[0.2em] text-xs uppercase mb-6 block">
          About
        </span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter leading-tight mb-6">
          Paul Clarke
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Frontend developer, Brisbane
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-8 space-y-6">
          <p className="text-foreground leading-relaxed text-lg">
            I came to development through teaching. For four years I taught Design and Digital
            Technologies in Queensland schools, and before that I worked as a learning support
            officer. Designing lessons for very different learners turned out to be good training
            for building interfaces: start with who’s using it, work out why before how, and make it
            work for everyone, not just the typical case.
          </p>

          <p className="text-muted-foreground leading-relaxed">
            I build in React and TypeScript, care about accessibility and tests, and I’m learning
            Vue. I’m looking for a frontend role on a product people rely on every day.
          </p>

          <div className="flex gap-3 pt-2">
            {LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-high text-sm text-white/70 hover:text-foreground hover:bg-surface-highest transition-colors"
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 flex justify-center lg:justify-end">
          <img
            src="/images/hs2.jpg"
            alt="Paul Clarke"
            width={240}
            height={240}
            className="h-48 w-48 rounded-2xl object-cover"
          />
        </div>
      </div>
    </section>
  );
}
