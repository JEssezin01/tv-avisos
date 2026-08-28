// Biblioteca de midias enviadas pelo painel.
// Arquivos: data/media/<id>.<ext>   |   Indice (metadados): data/media.json

import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';

const aqui = dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = join(aqui, '..', 'data', 'media');
export const TMP_DIR = join(aqui, '..', 'data', 'tmp');
const INDICE = join(aqui, '..', 'data', 'media.json');

// mime aceito -> extensao no disco + categoria
// Obs: .mov (video/quicktime) so toca na TV se o codec interno for H.264.
// .mov de iPhone costuma ser HEVC e NAO toca no navegador da Samsung.
const TIPOS = {
  'video/mp4': { ext: 'mp4', type: 'video' },
  'video/webm': { ext: 'webm', type: 'video' },
  'video/quicktime': { ext: 'mov', type: 'video' },
  'image/jpeg': { ext: 'jpg', type: 'image' },
  'image/png': { ext: 'png', type: 'image' },
  'image/webp': { ext: 'webp', type: 'image' },
};

export function mimeAceito(mime) {
  return Object.prototype.hasOwnProperty.call(TIPOS, mime);
}

export const MAX_ARQUIVO_BYTES = config.maxUploadMb * 1024 * 1024;
export const LIMITE_TOTAL_BYTES = config.storageLimitMb * 1024 * 1024;

let indice = []; // [{ id, name, type, mime, ext, size, uploadedAt }]

export async function carregarMidias() {
  await mkdir(MEDIA_DIR, { recursive: true });
  await mkdir(TMP_DIR, { recursive: true });
  try {
    const dados = JSON.parse(await readFile(INDICE, 'utf8'));
    indice = Array.isArray(dados) ? dados : [];
  } catch {
    indice = [];
    await gravarIndice();
  }
  return listarMidias();
}

export function listarMidias() {
  return indice.map((m) => ({ ...m }));
}

export function totalBytes() {
  return indice.reduce((soma, m) => soma + (m.size || 0), 0);
}

export function getMidia(id) {
  return indice.find((m) => m.id === id) || null;
}

// O que a TV precisa para exibir o item.
export function getMidiaPublica(id) {
  const m = getMidia(id);
  if (!m) return null;
  return { id: m.id, type: m.type, name: m.name, url: `/media/${m.id}.${m.ext}` };
}

// Move o arquivo temporario do multer para a biblioteca e registra no indice.
export async function adicionarMidia({ tmpPath, originalName, mime, size }) {
  const info = TIPOS[mime];
  if (!info) {
    await apagarSilencioso(tmpPath);
    throw comCodigo('Tipo de arquivo nao suportado', 'TIPO_INVALIDO');
  }
  if (size > MAX_ARQUIVO_BYTES) {
    await apagarSilencioso(tmpPath);
    throw comCodigo(`Arquivo acima de ${config.maxUploadMb} MB`, 'ARQUIVO_GRANDE');
  }
  if (totalBytes() + size > LIMITE_TOTAL_BYTES) {
    await apagarSilencioso(tmpPath);
    throw comCodigo('Sem espaco. Apague alguma midia antes de enviar outra.', 'SEM_ESPACO');
  }

  const id = randomBytes(9).toString('hex');
  const destino = join(MEDIA_DIR, `${id}.${info.ext}`);
  try {
    await rename(tmpPath, destino);
  } catch {
    // rename entre volumes diferentes pode falhar: copia e remove.
    await writeFile(destino, await readFile(tmpPath));
    await apagarSilencioso(tmpPath);
  }

  const registro = {
    id,
    name: limparNome(originalName) || `midia.${info.ext}`,
    type: info.type,
    mime,
    ext: info.ext,
    size,
    uploadedAt: new Date().toISOString(),
  };
  indice.push(registro);
  await gravarIndice();
  return { ...registro };
}

export async function removerMidia(id) {
  const i = indice.findIndex((m) => m.id === id);
  if (i === -1) return false;
  const [m] = indice.splice(i, 1);
  await gravarIndice();
  await apagarSilencioso(join(MEDIA_DIR, `${m.id}.${m.ext}`));
  return true;
}

function comCodigo(mensagem, codigo) {
  const err = new Error(mensagem);
  err.code = codigo;
  return err;
}

function limparNome(nome) {
  return String(nome || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function gravarIndice() {
  await writeFile(INDICE, JSON.stringify(indice, null, 2), 'utf8');
}

async function apagarSilencioso(caminho) {
  try {
    await unlink(caminho);
  } catch {
    /* arquivo ja nao existe */
  }
}
