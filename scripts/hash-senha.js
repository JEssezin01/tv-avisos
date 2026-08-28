// Gera o hash bcrypt da senha do painel.
//
// Uso:
//   npm run hash -- "suaSenhaAqui"
//
// Copie a linha "ADMIN_PASSWORD_HASH=..." que aparecer para o seu .env.

import bcrypt from 'bcryptjs';

const senha = process.argv[2];

if (!senha) {
  console.error('Uso: npm run hash -- "suaSenhaAqui"');
  process.exit(1);
}

if (senha.length < 6) {
  console.error('Escolha uma senha com pelo menos 6 caracteres.');
  process.exit(1);
}

const hash = bcrypt.hashSync(senha, 12);

console.log('\nAdicione esta linha ao seu arquivo .env:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
