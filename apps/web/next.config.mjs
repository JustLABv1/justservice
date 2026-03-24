import process from "node:process"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"
    return [
      {
        source: "/api/auth/me",
        destination: `${apiUrl}/api/auth/me`,
      },
      {
        source: "/api/auth/register",
        destination: `${apiUrl}/api/auth/register`,
      },
      {
        source: "/api/auth/oidc/:path*",
        destination: `${apiUrl}/api/auth/oidc/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
