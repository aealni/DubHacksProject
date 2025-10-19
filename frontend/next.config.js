/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true';

const nextConfig = {
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true
  },
  assetPrefix: '',
  basePath: '',
  // Disable server-side features for static export
  experimental: {
    esmExternals: false
  },
  // Skip linting during build for production deployment
  eslint: {
    ignoreDuringBuilds: true
  },
  // Skip TypeScript checking during build
  typescript: {
    ignoreBuildErrors: true
  }
}

if (isStaticExport) {
  nextConfig.output = 'export';
}

module.exports = nextConfig