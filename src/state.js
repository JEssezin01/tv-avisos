// Estado atual do telao.
// Fica em memoria e e gravado em data/state.json (sobrevive a restart / reboot).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMidiaPublica, getMidia } from './media.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = join(aqui, '..', 'data', 'state.json');

const LIMITE_MENSAGEM = 500;
const LIMITE_TITULO = 120;
const LIMITE_PLAYLIST = 50;

const FONTES = new Set(['serif', 'sans', 'impact', 'mono']);

const PADRAO = {
  mode: 'aviso', // 'aviso' (texto) | 'media' (um item) | 'playlist' (rodizio)
  message: 'Bem-vindo!',
  layout: 'horizontal', // 'horizontal' (deitado) | 'vertical' (em pe)
  mediaId: null, // id da midia, quando mode === 'media'
  playlist: [], // [{ id, title }] quando mode === 'playlist'
  playSettings: { nameSec: 5, photoSec: 10, videoMaxSec: 90 },
  // Aparencia do nome que aparece por cima da midia na playlist.
  nameStyle: {
    color: '#f2e6dc',
    bg: '#071633',
    bgOpacity: 0.82,
    font: 'serif',
    alwaysOn: false, // true = fica fixo; false = some depois de nameSec
  },
  updatedAt: new Date().toISOString(),
};

let estado = {
  ...PADRAO,
  playlist: [],
  playSettings: { ...PADRAO.playSettings },
  nameStyle: { ...PADRAO.nameStyle },
};

function normalizarLayout(v) {
  return v === 'vertical' ? 'vertical' : 'horizontal';
}
function normalizarModo(v) {
  return v === 'media' || v === 'playlist' ? v : 'aviso';
}
function clamp(n, lo, hi, def) {
  n = Number(n);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
}
function limparPlaylist(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((it) => it && typeof it.id === 'string' && getMidia(it.id))
    .map((it) => ({
      id: it.id,
      title: typeof it.title === 'string' ? it.title.slice(0, LIMITE_TITULO) : '',
    }))
    .slice(0, LIMITE_PLAYLIST);
}
function limparSettings(s, base) {
  const b = base || PADRAO.playSettings;
  if (!s || typeof s !== 'object') return { ...b };
  return {
    nameSec: clamp(s.nameSec, 1, 30, b.nameSec),
    photoSec: clamp(s.photoSec, 2, 120, b.photoSec),
    videoMaxSec: clamp(s.videoMaxSec, 5, 600, b.videoMaxSec),
  };
}
function ehHex(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}
function limparNameStyle(s, base) {
  const b = base || PADRAO.nameStyle;
  if (!s || typeof s !== 'object') return { ...b };
  const op = Number(s.bgOpacity);
  return {
    color: ehHex(s.color) ? s.color.toLowerCase() : b.color,
    bg: ehHex(s.bg) ? s.bg.toLowerCase() : b.bg,
    bgOpacity: Number.isFinite(op) ? Math.min(1, Math.max(0, op)) : b.bgOpacity,
    font: FONTES.has(s.font) ? s.font : b.font,
    alwaysOn: typeof s.alwaysOn === 'boolean' ? s.alwaysOn : b.alwaysOn,
  };
}

export async function carregarEstado() {
  try {
    const salvo = JSON.parse(await readFile(ARQUIVO, 'utf8'));
    estado = {
      mode: normalizarModo(salvo.mode),
      message: typeof salvo.message === 'string' ? salvo.message : PADRAO.message,
      layout: normalizarLayout(salvo.layout),
      mediaId: typeof salvo.mediaId === 'string' ? salvo.mediaId : null,
      playlist: limparPlaylist(salvo.playlist),
      playSettings: limparSettings(salvo.playSettings),
      nameStyle: limparNameStyle(salvo.nameStyle),
      updatedAt: salvo.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    await gravar(); // primeira execucao: cria com o padrao
  }
  return getEstado();
}

// Estado "cru" (uso interno).
export function getEstado() {
  return {
    ...estado,
    playlist: estado.playlist.map((p) => ({ ...p })),
    playSettings: { ...estado.playSettings },
    nameStyle: { ...estado.nameStyle },
  };
}

// Estado que vai para a TV: resolve midias e cai para 'aviso' se nao sobrar nada.
export function getEstadoPublico() {
  const media = estado.mode === 'media' ? getMidiaPublica(estado.mediaId) : null;

  const playlist = estado.playlist
    .map((it) => {
      const m = getMidiaPublica(it.id);
      return m ? { id: m.id, title: it.title || m.name, type: m.type, url: m.url } : null;
    })
    .filter(Boolean);

  let mode = estado.mode;
  if (mode === 'media' && !media) mode = 'aviso';
  if (mode === 'playlist' && playlist.length === 0) mode = 'aviso';

  return {
    mode,
    message: estado.message,
    layout: estado.layout,
    media,
    playlist,
    playSettings: { ...estado.playSettings },
    nameStyle: { ...estado.nameStyle },
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
  if (Array.isArray(patch.playlist)) {
    estado.playlist = limparPlaylist(patch.playlist);
  }
  if (patch.playSettings) {
    estado.playSettings = limparSettings(patch.playSettings, estado.playSettings);
  }
  if (patch.nameStyle) {
    estado.nameStyle = limparNameStyle(patch.nameStyle, estado.nameStyle);
  }
  if (patch.mode === 'aviso' || patch.mode === 'media' || patch.mode === 'playlist') {
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
