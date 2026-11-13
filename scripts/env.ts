// Подхватывает .env для скриптов (Next.js делает это сам для сайта)
try {
  process.loadEnvFile('.env');
} catch {
  /* файла .env нет — это нормально */
}
