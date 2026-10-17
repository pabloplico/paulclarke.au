# paulclarke.au

[![CI](https://github.com/pabloplico/paulclarke.au/actions/workflows/ci.yml/badge.svg)](https://github.com/pabloplico/paulclarke.au/actions/workflows/ci.yml)

A pnpm + NX monorepo in TypeScript: Paul Clarke's portfolio site and a document workspace app.

## What's in here

| Path                         | What it is                                                                         | Stack              |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| `apps/website`               | Developer portfolio: projects, an AI readiness assessment, writing and contact     | React (Vite), Hono |
| `apps/admin-portal`          | Document workspace app: upload, parse and route documents, edit sections with AI   | Next.js            |
| `apps/jobquest`              | Job market analyser, being rebuilt in Vue 3 on a Cloudflare Worker with D1         | Vue 3, Hono, D1    |
| `packages/ui`                | Shared React components (`@repo/ui/button`, …)                                     | React              |
| `packages/tailwind-theme`    | Shared Tailwind theme: design tokens, base body styles, focus ring, reduced motion | Tailwind CSS       |
| `packages/typescript-config` | Shared `tsconfig` presets: `base` (strict), `vite`, `nextjs`, `react-library`      | TypeScript         |
| `packages/biome-config`      | Shared lint and format rules                                                       | Biome              |
| `packages/prettier-config`   | Markdown formatting                                                                | Prettier           |

Apps import shared code by package name (`@repo/ui/button`). `@repo/ui` is consumed as TypeScript source and compiled by each app's bundler, so it has no build step of its own. `pnpm exec nx graph` shows how the projects depend on each other.

## Getting started

You need Node and pnpm. `corepack enable` installs the pnpm version set in `package.json`. Docker is optional.

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the website, jobquest and the admin portal. The admin portal runs on an embedded database (PGlite) with sign-in off, so it needs no other services. To run it against Postgres instead (`admin-portal:dev:full`), see [CLAUDE.md](CLAUDE.md).

The website needs no environment variables. The admin portal's settings are listed in [`.env.docker.example`](.env.docker.example).

## Common commands

Run these from the repo root. NX runs each task in every project that defines it and caches the results.

```bash
pnpm lint          # Biome in every package, plus root config files
pnpm check-types   # tsc --noEmit
pnpm test          # Vitest unit tests
pnpm build         # production builds
pnpm test:e2e      # Playwright end-to-end tests
```

## Testing

Both apps have Vitest unit tests and Playwright end-to-end tests, and every website page gets an automated accessibility check with axe. CI runs all of them. [TESTING.md](TESTING.md) covers what each suite tests and how the mocks work.

## Deployment

The website is a single Cloudflare Worker. It serves the SPA through the Static Assets binding and the blog posts from `/api/posts`. CI deploys it after a push to `main` when NX reports the website as affected; `pnpm run deploy` in `apps/website` deploys by hand.

The admin portal ships as a Docker image built from the repo root:

```bash
docker build -t admin-portal -f apps/admin-portal/Dockerfile .
```

## More

- [TESTING.md](TESTING.md): test suites, coverage and mocking patterns
- [CLAUDE.md](CLAUDE.md): detailed setup, environment variables and conventions (also used by Claude Code)
- [docs/decisions.md](docs/decisions.md): design decisions and their trade-offs

## Licence

Code is [MIT](LICENSE). The photo in `apps/website/public/images/hs2.jpg` and the blog posts in `apps/website/content/posts/` aren't covered by the MIT licence; please don't reuse them.
