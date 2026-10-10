import path from "node:path";

// `npm run dev:demo` swaps Firebase for an in-browser store with example data, so the app can be
// tried without a Firebase project. Normal `dev`, `build` and Vercel deploys always use real Firebase.
const demo = process.env.npm_lifecycle_event === "dev:demo";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // demo builds into its own folder, so running `next build` or `next dev` alongside it can't corrupt it
  distDir: demo ? ".next-demo" : ".next",
  webpack(config, { webpack }) {
    if (demo) {
      const standIn = path.resolve("dev/firebase.demo.js");
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]lib[\\/]firebase(\.js)?$/, r => { r.request = standIn; }));
    }
    return config;
  },
};

export default nextConfig;
