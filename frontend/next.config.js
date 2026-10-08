const path = require("node:path");
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname, "..") },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
};
