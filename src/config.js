// Le e valida as variaveis de ambiente do arquivo .env.
// Se faltar algo obrigatorio, o app para na hora com uma mensagem clara.

import 'dotenv/config';

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (valor === undefined || valor.trim() === '') {
    console.error(`[config] Falta a variavel de ambiente: ${nome}`);
    console.error('[config] Copie .env.example para .env e preencha os valores.');
    process.exit(1);
  }
  return valor;
}

export const config = {
  port: Number(process.env.PORT ?? 4173),
  sessionSecret: obrigatoria('SESSION_SECRET'),
  adminPasswordHash: obrigatoria('ADMIN_PASSWORD_HASH'),
  cookieSecure: String(process.env.COOKIE_SECURE ?? 'false').toLowerCase() === 'true',
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  isProd: process.env.NODE_ENV === 'production',

  // Midia: tamanho maximo por arquivo e espaco total no servidor.
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 500),
  storageLimitMb: Number(process.env.STORAGE_LIMIT_MB ?? 3072),
};
