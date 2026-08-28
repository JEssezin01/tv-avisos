// Autenticacao do painel de controle.
// Modelo simples: uma unica senha, guardada como hash bcrypt no .env.
// A sessao fica num cookie httpOnly e e persistida em arquivo, entao
// o login continua valido depois de um restart do PM2.

import { Router } from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import FileStoreFactory from 'session-file-store';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const FileStore = FileStoreFactory(session);

// --- Middleware de sessao -------------------------------------------------

export const sessionMiddleware = session({
  name: 'tv.sid',
  secret: config.sessionSecret,
  store: new FileStore({
    path: join(aqui, '..', 'sessions'),
    ttl: 60 * 60 * 24 * 30, // 30 dias, em segundos
    retries: 1,
    logFn: () => {}, // silencia os logs internos do store
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true, // renova a validade a cada requisicao
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure, // true atras de HTTPS (producao)
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias, em ms
  },
});

// --- Protecao contra forca bruta no login -------------------------------

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10, // no maximo 10 tentativas por IP nessa janela
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente de novo em alguns minutos.' },
});

// --- Guarda de rota -----------------------------------------------------

export function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Nao autenticado' });
}

// --- Rotas ------------------------------------------------------------

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const senha = String((req.body && req.body.senha) || '');
  if (!senha) {
    return res.status(400).json({ error: 'Informe a senha' });
  }

  const ok = await bcrypt.compare(senha, config.adminPasswordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }

  req.session.authed = true;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Erro ao criar a sessao' });
    return res.json({ ok: true });
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('tv.sid');
    res.json({ ok: true });
  });
});

authRouter.get('/me', (req, res) => {
  res.json({ authed: Boolean(req.session && req.session.authed) });
});
