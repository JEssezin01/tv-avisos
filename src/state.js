// Estado atual do telao.
// Fica em memoria e e gravado em data/state.json (sobrevive a restart / reboot).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMidiaPublica } from './media.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = join(aqui, '..', 'data', 'state.json');

const LIMITE_MENSAGEM = 500;

const PADRAO = {
  mode: 'aviso', // 'aviso' (texto) ou 'media' (video/imagem)
  message: 'Bem-vindo!',
  layout: 'horizontal', // 'horizontal' (deitado) ou 'vertical' (em pe)
  mediaId: null, // id da midia em exibicao, quando mode === 'media'
  updatedAt: new Date().toISOString(),
};

let estado = { ...PADRAO };

function normalizarLayout(valor) {
  return valor === 'vertical' ? 'vertical' : 'horizontal';
}

function normalizarModo(valor) {
  return valor === 'media' ? 'media' : 'aviso';
}

export async function carregarEstado() {
  try {
    const salvo = JSON.parse(await readFile(ARQUIVO, 'utf8'));
    estado = {
      mode: normalizarModo(salvo.mode),
      message: typeof salvo.message === 'string' ? salvo.message : PADRAO.message,
      layout: normalizarLayout(salvo.layout),
      mediaId: typeof salvo.mediaId === 'string' ? salvo.mediaId : null,
      updatedAt: salvo.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    await gravar(); // primeira execucao: cria com o padrao
  }
  return getEstado();
}

// Estado "cru" (uso interno).
export function getEstado() {
  return { ...estado };
}

// Estado que vai para a TV: resolve a midia e cai para 'aviso' se ela sumiu.
export function getEstadoPublico() {
  const media = estado.mode === 'media' ? getMidiaPublica(estado.mediaId) : null;
  return {
    mode: media ? 'media' : 'aviso',
    message: estado.message,
    layout: estado.layout,
    media,
    updatedAt: estado.updatedAt,
  };
}

export async function atualizarEstado(patch = {}) {
  if (typeof patch.message === 'string') {
    estado.message = patch.message.slice(0, LIMITE_MENSAGEM);
  }
  if (patch.layout === 'horizontal' || patch.layout === 'vertical') {
    estado.layout = patch.layout;
  }
  if (patch.mode === 'aviso' || patch.mode === 'media') {
    estado.mode = patch.mode;
  }
  if (patch.mediaId === null || typeof patch.mediaId === 'string') {
    estado.mediaId = patch.mediaId;
  }
  estado.updatedAt = new Date().toISOString();
  await gravar();
  return getEstado();
}

async function gravar() {
  await mkdir(dirname(ARQUIVO), { recursive: true });
  await writeFile(ARQUIVO, JSON.stringify(estado, null, 2), 'utf8');
}
