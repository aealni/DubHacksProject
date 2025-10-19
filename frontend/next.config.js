/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
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

module.exports = nextConfig