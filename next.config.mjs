const distDir = process.env.NEXT_DIST_DIR?.trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: distDir || ".next",
};

export default nextConfig;
