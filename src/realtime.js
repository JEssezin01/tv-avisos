// Camada de tempo real (Socket.io).
//
// Regra: sockets nao ALTERAM o estado do telao (isso e so por rota HTTP
// autenticada). A unica coisa que a TV manda por socket e a posicao atual
// da playlist ('plpos') -- so um numero, para o painel mostrar onde esta.

import { getEstadoPublico } from './state.js';

// Posicao da playlist reportada pela TV (memoria, nao persiste).
let plPos = { i: 0, total: 0, ts: 0 };

export function getPlPos() {
  return { ...plPos };
}

function comPos() {
  return { ...getEstadoPublico(), playlistPos: plPos };
}

export function setupRealtime(io) {
  io.on('connection', (socket) => {
    // Toda TV/painel que conecta ja recebe o estado atual na hora.
    socket.emit('state', comPos());

    socket.on('plpos', (d) => {
      if (!d || typeof d !== 'object') return;
      const i = Number(d.i);
      const total = Number(d.total);
      if (!Number.isFinite(i) || !Number.isFinite(total)) return;
      plPos = {
        i: Math.max(0, Math.min(999, Math.round(i))),
        total: Math.max(0, Math.min(999, Math.round(total))),
        ts: Date.now(),
      };
    });
  });
}

export function broadcastEstado(io) {
  io.emit('state', comPos());
}
