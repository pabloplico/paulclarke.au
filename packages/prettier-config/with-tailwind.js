import baseConfig from './index.js';

/**
 * @repo/prettier-config/with-tailwind - Prettier config with Tailwind CSS plugin
 *
 * @type {import("prettier").Config}
 */
const config = {
  ...baseConfig,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['clsx', 'cn', 'cva'],
};

export default config;
