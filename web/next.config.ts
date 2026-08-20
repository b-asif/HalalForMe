import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow images from Supabase storage
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'alalaxezygrhxalssxfi.supabase.co' },
    ],
  },
}

export default nextConfig
