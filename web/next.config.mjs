import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  images: { unoptimized: true },
  outputFileTracingRoot: dir,
  webpack: (config) => {
    config.resolve.alias['@'] = path.join(dir, 'src');
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
