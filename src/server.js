// Ponto de entrada do app.
// Junta Express (rotas HTTP) + servidor HTTP + Socket.io (tempo real).

import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import multer from 'multer';
import { Server as SocketServer } from 'socket.io';

import { config } from './config.js';
import { sessionMiddleware, authRouter, requireAuth } from './auth.js';
import { carregarEstado, getEstado, getEstadoPublico, atualizarEstado } from './state.js';
import { setupRealtime, broadcastEstado } from './realtime.js';
import {
  carregarMidias,
  listarMidias,
  adicionarMidia,
  removerMidia,
  getMidia,
  totalBytes,
  mimeAceito,
  MEDIA_DIR,
  TMP_DIR,
  MAX_ARQUIVO_BYTES,
  LIMITE_TOTAL_BYTES,
} from './media.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const PASTA_PUBLICA = join(aqui, '..', 'public');

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: false } });

// Necessario para cookies "secure" e rate-limit funcionarem atras do Nginx.
app.set('trust proxy', config.trustProxy);

// --- Seguranca e utilidades ------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);
app.use(compression());
app.use(express.json({ limit: '16kb' }));
app.use(sessionMiddleware);

// --- Upload de midia (multipart) -----------------------------------

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_ARQUIVO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, mimeAceito(file.mimetype)),
});

// --- Rotas de autenticacao -----------------------------------------

app.use('/auth', authRouter);

// --- API do estado do telao --------------------------------------

// Leitura: publica (a TV precisa poder ler sem login).
app.get('/api/state', (req, res) => {
  res.json(getEstadoPublico());
});

// Escrita: so com login (painel de controle).
app.post('/api/state', requireAuth, async (req, res) => {
  const body = req.body || {};
  const patch = {};

  if (typeof body.message === 'string') patch.message = body.message;
  if (body.layout === 'horizontal' || body.layout === 'vertical') patch.layout = body.layout;

  if (body.mode === 'aviso') {
    patch.mode = 'aviso';
    patch.mediaId = null;
  } else if (body.mode === 'media') {
    if (typeof body.mediaId !== 'string' || !getMidia(body.mediaId)) {
      return res.status(400).json({ error: 'Midia inexistente' });
    }
    patch.mode = 'media';
    patch.mediaId = body.mediaId;
  }

  await atualizarEstado(patch);
  broadcastEstado(io); // avisa todas as TVs na hora
  res.json(getEstadoPublico());
});

// --- API da biblioteca de midias --------------------------------

// Lista + uso de espaco (publica).
app.get('/api/media', (req, res) => {
  const items = listarMidias().sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json({
    items,
    usage: {
      usedBytes: totalBytes(),
      limitBytes: LIMITE_TOTAL_BYTES,
      maxFileBytes: MAX_ARQUIVO_BYTES,
    },
  });
});

// Enviar midia (so com login).
app.post('/api/media', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Arquivo acima de ${config.maxUploadMb} MB` });
      }
      return res.status(400).json({ error: 'Falha ao receber o arquivo' });
    }
    if (!req.file) {
      return res
        .status(415)
        .json({ error: 'Envie video .mp4/.webm ou imagem .jpg/.png/.webp' });
    }
    try {
      const item = await adicionarMidia({
        tmpPath: req.file.path,
        originalName: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
      });
      res.status(201).json({ item });
    } catch (e) {
      const status = { SEM_ESPACO: 409, ARQUIVO_GRANDE: 413, TIPO_INVALIDO: 415 };
      res.status(status[e.code] || 500).json({ error: e.message });
    }
  });
});

// Apagar midia (so com login).
app.delete('/api/media/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!getMidia(id)) return res.status(404).json({ error: 'Midia nao encontrada' });

  // Se essa midia esta no ar, volta para o aviso de texto antes de apagar.
  const atual = getEstado();
  if (atual.mode === 'media' && atual.mediaId === id) {
    await atualizarEstado({ mode: 'aviso', mediaId: null });
    broadcastEstado(io);
  }

  await removerMidia(id);
  res.json({ ok: true });
});

// Arquivos de midia. Nomes sao ids unicos -> pode cachear "para sempre",
// assim a TV nao rebaixa o video a cada volta do loop.
app.use(
  '/media',
  express.static(MEDIA_DIR, {
    maxAge: '365d',
    immutable: true,
    index: false,
    fallthrough: false,
  }),
);

// --- Arquivos estaticos (tv.html, admin.html, css, js) ------------

app.get('/', (req, res) => res.redirect('/tv'));
app.use(express.static(PASTA_PUBLICA, { extensions: ['html'] }));

// --- Tempo real -------------------------------------------------

setupRealtime(io);

// --- Sobe o servidor ----------------------------------------

await carregarMidias();
await carregarEstado();
httpServer.listen(config.port, () => {
  console.log(`[tv-avisos] no ar em http://localhost:${config.port}`);
  console.log(`[tv-avisos] TV:     http://localhost:${config.port}/tv`);
  console.log(`[tv-avisos] Painel: http://localhost:${config.port}/admin`);
});
