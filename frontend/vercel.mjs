/**
 * Haven Home production routing on Vercel.
 * Set HAVEN_API_ORIGIN in the FRONTEND Vercel project to the HTTPS origin
 * of the separately deployed backend, without /api or a trailing slash.
 * Vercel evaluates this configuration during deployment.
 *
 * Keeping /api on the frontend's public origin preserves the existing
 * browser cookie sessions (credentials: 'same-origin') with no React changes.
 */
const rawApiOrigin = process.env.HAVEN_API_ORIGIN?.trim();

if (!rawApiOrigin) {
  throw new Error(
    'Missing HAVEN_API_ORIGIN. Configure it in the frontend Vercel project as ' +
      'https://<your-backend-project>.vercel.app, then redeploy.'
  );
}

const apiOrigin = new URL(rawApiOrigin);
if (apiOrigin.protocol !== 'https:' || apiOrigin.pathname !== '/' || apiOrigin.search || apiOrigin.hash || apiOrigin.username || apiOrigin.password) {
  throw new Error('HAVEN_API_ORIGIN must be a HTTPS origin only, without a path, query, credentials, or fragment.');
}

export const config = {
  framework: 'vite',
  rewrites: [
    // MUST precede the catch-all SPA route.
    { source: '/api/:path*', destination: `${apiOrigin.origin}/api/:path*` },
    // React Router's client-side routes work when directly opened/refreshed.
    { source: '/(.*)', destination: '/index.html' },
  ],
};
