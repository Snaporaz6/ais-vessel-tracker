const path = require("node:path");
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname, "..") },
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/port-traffic": ["./public/marine-data/ports.json"],
    "/api/map-data": ["./public/marine-data/*.json"],
    "/api/maritime-warnings": ["./public/warnings/*.json"],
  },
};
