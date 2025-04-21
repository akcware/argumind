/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other configurations if they exist ...
  ignoreBuildErrors: true,
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },

  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // ... other configurations if they exist ...
};

export default nextConfig;
