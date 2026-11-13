/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Эти пакеты работают только на сервере и не должны попадать в бандл
  // Загрузка документов: файл до 3 МБ + поля формы
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default nextConfig;
