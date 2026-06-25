/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '192.168.*'],
    },
  },
}

export default nextConfig
