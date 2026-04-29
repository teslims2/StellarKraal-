/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

const createNextIntlPlugin = require('next-intl/plugin');

module.exports = createNextIntlPlugin('./src/i18n.ts')(nextConfig);
