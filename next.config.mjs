/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other configurations if they exist ...
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // ... other configurations if they exist ...
};

export default nextConfig;
