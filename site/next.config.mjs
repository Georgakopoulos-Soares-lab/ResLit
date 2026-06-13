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
      // Allow server actions from local network (192.168.x.x) for multi-device access
      allowedOrigins: ['localhost:3000', '192.168.*'],
    },
  },
}

export default nextConfig
