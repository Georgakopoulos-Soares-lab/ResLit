/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // better-sqlite3 is a native module — keep it external rather than letting
  // the bundler try to inline it, so the compiled .node binary is traced and
  // copied into .next/standalone correctly.
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '192.168.*'],
    },
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }]
  },
}

export default nextConfig
