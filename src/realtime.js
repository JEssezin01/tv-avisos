// Camada de tempo real (Socket.io).
//
// Regra de seguranca: os sockets sao SO PARA RECEBER.
// Nenhuma alteracao de estado acontece por socket. Quem muda o telao e o
// painel logado, via rotas protegidas em server.js, que chamam broadcastEstado().

import { getEstadoPublico } from './state.js';

export function setupRealtime(io) {
  io.on('connection', (socket) => {
    // Toda TV/painel que conecta ja recebe o estado atual na hora.
    socket.emit('state', getEstadoPublico());
  });
}

export function broadcastEstado(io) {
  io.emit('state', getEstadoPublico());
}
