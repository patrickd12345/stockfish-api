/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    CHESSCOMUSERNAME: process.env.CHESSCOMUSERNAME,
    LICHESSUSERNAMES: process.env.LICHESSUSERNAMES,
  },
}

module.exports = nextConfig
