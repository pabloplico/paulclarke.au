import { Link } from '@tanstack/react-router';

const linkClass =
  'text-white/60 hover:text-white transition-opacity font-label text-xs uppercase tracking-widest';

export function Footer() {
  return (
    <footer className="bg-background w-full py-12 px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <p className="font-label text-xs uppercase tracking-widest text-white/60">
          &copy; {new Date().getFullYear()} Paul Clarke
        </p>
        <ul className="flex gap-8">
          <li>
            <a href="https://linkedin.com/in/paul-clarke-70959541" className={linkClass}>
              LinkedIn
            </a>
          </li>
          <li>
            <a href="https://github.com/pabloplico" className={linkClass}>
              GitHub
            </a>
          </li>
          <li>
            <Link
              to="/contact"
              className="text-primary font-label text-xs uppercase tracking-widest hover:underline"
            >
              Contact
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
