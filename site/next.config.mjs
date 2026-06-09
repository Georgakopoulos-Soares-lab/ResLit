/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Allow server actions from local network (192.168.x.x) for multi-device access
      allowedOrigins: ['localhost:3000', '192.168.*'],
    },
  },
}

export default nextConfig
