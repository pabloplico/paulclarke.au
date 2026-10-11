import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** TODO: set to the CV's URL (e.g. '/paul-clarke-cv.pdf'). The CV button is hidden while null. */
const CV_URL: string | null = null;

const secondaryButton =
  'glass-card border border-white/[0.08] text-white px-8 py-4 rounded-full font-label font-bold text-sm uppercase tracking-widest hover:bg-surface-highest transition-colors flex items-center justify-center gap-2';

export function HeroSection() {
  useDocumentTitle(null);

  return (
    <div className="pb-16">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] left-[-5%] w-[300px] h-[300px] bg-[#dfe1f6]/5 blur-[100px] rounded-full" />
      </div>

      <section className="relative min-h-[85vh] flex items-center pt-20 md:pt-32">
        <div className="relative z-10 w-full">
          <div className="flex flex-col justify-center max-w-4xl">
            <p className="font-label text-primary tracking-[0.2em] text-xs uppercase mb-6">
              Frontend developer, Brisbane
            </p>

            <h1 className="text-[2.75rem] md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.1] mb-8">
              Paul Clarke
            </h1>

            <p className="text-2xl md:text-3xl font-semibold text-foreground max-w-3xl mb-6 leading-snug">
              I build accessible, well-tested web apps with React and TypeScript.
            </p>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              Before code, I spent four years teaching Design and Digital Technologies. That taught
              me to explain technical ideas clearly and to design for people who don’t think the way
              I do.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/projects"
                className="bg-primary text-primary-foreground px-8 py-4 rounded-full font-label font-bold text-sm uppercase tracking-widest hover:scale-[0.97] transition-transform neon-glow flex items-center justify-center gap-2"
              >
                View projects
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/contact" className={secondaryButton}>
                Get in touch
              </Link>
              {CV_URL && (
                <a href={CV_URL} className={secondaryButton}>
                  CV
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
