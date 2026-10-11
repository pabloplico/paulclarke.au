import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PROJECTS, type Project, type ProjectLink } from '@/lib/data/projects';

const linkClass =
  'inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-foreground hover:border-primary hover:text-primary transition-colors';

function ProjectLinks({ links }: { links: ProjectLink[] }) {
  // Links still marked TODO (href: null) are not rendered
  const available = links.filter((l) => !('href' in l) || l.href !== null);
  if (available.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-3 pt-2">
      {available.map((link) => (
        <li key={link.label}>
          {'to' in link ? (
            <Link to={link.to} className={linkClass}>
              {link.label}
            </Link>
          ) : (
            <a
              href={link.href ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {link.label}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const titleId = `project-${project.id}-title`;
  const isShort = project.variant === 'short';

  return (
    <article
      aria-labelledby={titleId}
      className="h-full rounded-xl bg-card border border-white/10 glass p-6 md:p-8 flex flex-col gap-5"
    >
      {project.image && (
        <img
          src={project.image.src}
          alt={project.image.alt}
          loading="lazy"
          className="w-full rounded-lg border border-white/10 object-cover aspect-video"
        />
      )}

      <h2 id={titleId} className="text-2xl font-bold tracking-tight">
        {project.title}
      </h2>

      {isShort || !project.problem ? (
        <p className="text-muted-foreground leading-relaxed">{project.summary}</p>
      ) : (
        <dl className="space-y-4">
          <div>
            <dt className="font-label text-xs uppercase tracking-[0.2em] text-primary mb-1">
              Problem
            </dt>
            <dd className="text-muted-foreground leading-relaxed">{project.problem}</dd>
          </div>
          {project.solution && (
            <div>
              <dt className="font-label text-xs uppercase tracking-[0.2em] text-primary mb-1">
                Solution
              </dt>
              <dd className="text-muted-foreground leading-relaxed">{project.solution}</dd>
            </div>
          )}
          {project.highlights && project.highlights.length > 0 && (
            <div>
              <dt className="font-label text-xs uppercase tracking-[0.2em] text-primary mb-1">
                Highlights
              </dt>
              <dd>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {project.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-auto space-y-4">
        <ul aria-label={`${project.title} tech stack`} className="flex flex-wrap gap-2">
          {project.stack.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {tag}
            </li>
          ))}
        </ul>
        <ProjectLinks links={project.links} />
      </div>
    </article>
  );
}

export function ProjectsSection() {
  useDocumentTitle('Projects');

  return (
    <section aria-labelledby="projects-heading" className="pt-20 md:pt-32 pb-16 relative">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <h1
        id="projects-heading"
        className="relative text-4xl md:text-5xl font-bold tracking-tighter leading-tight mb-12"
      >
        Projects
      </h1>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {PROJECTS.map((project) => (
          <li key={project.id} className={project.variant === 'short' ? 'lg:col-span-2' : ''}>
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>
    </section>
  );
}
