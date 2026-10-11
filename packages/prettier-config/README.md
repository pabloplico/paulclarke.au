# @repo/prettier-config

Shared Prettier configuration for the monorepo.

## Usage

### Base Configuration

Create a `prettier.config.mjs` in your app:

```js
import config from '@repo/prettier-config';
export default config;
```

### With Tailwind CSS

For projects using Tailwind CSS:

```js
import config from '@repo/prettier-config/with-tailwind';
export default config;
```

## Configuration

### Base Config

- **Semi**: true
- **Single quotes**: true
- **Tab width**: 2
- **Trailing comma**: es5
- **Print width**: 100
- **End of line**: lf

### With Tailwind

Extends base config with:
- `prettier-plugin-tailwindcss` plugin
- Tailwind class sorting for `clsx`, `cn`, and `cva` functions
