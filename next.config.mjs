/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module; keep it external to the server bundle
  // so the .node binary is loaded at runtime rather than bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
