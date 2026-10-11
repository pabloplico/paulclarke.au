# @repo/biome-config

Shared Biome configuration for the monorepo.

## Usage

### Next.js Apps

Create a `biome.json` in your app:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "extends": ["@repo/biome-config/nextjs"]
}
```

### React + Vite Apps

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "extends": ["@repo/biome-config/react-vite"]
}
```

### Base Config (for custom setups)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "extends": ["@repo/biome-config/base"]
}
```

## Configuration

### Base Config

**Formatter:**
- Indent: 2 spaces
- Line width: 100
- Single quotes
- ES5 trailing commas
- Semicolons: always

**Linter:**
- Recommended rules enabled
- Unused variables/imports as warnings
- `noExplicitAny` as warning
- `noNonNullAssertion` as warning

### Next.js Config

Extends base with:
- Ignores `.next/`, `out/`, `build/`
- React hooks `useExhaustiveDependencies` as warning

### React Vite Config

Extends base with:
- Ignores `dist/`, `build/`
- React hooks `useExhaustiveDependencies` as warning

## Local Overrides

You can override any settings locally:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "extends": ["@repo/biome-config/nextjs"],
  "formatter": {
    "lineWidth": 120
  },
  "javascript": {
    "formatter": {
      "semicolons": "asNeeded"
    }
  }
}
```
