import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  webpack: config => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['three/webgpu'] = path.join(__dirname, 'lib', 'three-webgpu.js');
    config.resolve.alias['three/tsl'] = path.join(__dirname, 'lib', 'three-tsl.js');
    return config;
  }
};

export default nextConfig;
