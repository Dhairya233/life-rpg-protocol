// next.config.mjs
// Security headers sent with every page. (A strict Content-Security-Policy
// is NOT set yet: Next.js inline scripts need a nonce-based setup, which is
// listed as future work in docs/SECURITY.md.)
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },          // don't guess file types
  { key: 'X-Frame-Options', value: 'DENY' },                    // nobody may put us in an iframe (clickjacking)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
