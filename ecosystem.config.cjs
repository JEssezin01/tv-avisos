// Configuracao do PM2 para rodar o app isolado na VPS.
// Uma falha aqui reinicia SO este processo, sem afetar o app financeiro.
//
// Uso na VPS:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup   (uma vez, para subir sozinho no boot)

module.exports = {
  apps: [
    {
      name: 'tv-avisos',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      // As demais variaveis (PORT, SESSION_SECRET, etc.) vem do arquivo .env,
      // carregado pelo dotenv em src/config.js.
    },
  ],
};
