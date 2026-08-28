// Player da TV: recebe o estado do servidor e atualiza o telao.
// Nao envia nada, so escuta.

const elStage = document.getElementById('stage');
const elAviso = document.getElementById('aviso');
const elVideo = document.getElementById('mediaVideo');
const elImg = document.getElementById('mediaImage');
const elStatus = document.getElementById('status');
const elFsBtn = document.getElementById('fsBtn');

let urlAtual = null; // evita recarregar a mesma midia a toa

function aplicarLayout(layout) {
  const vertical = layout === 'vertical';
  document.body.classList.toggle('layout-vertical', vertical);
  document.body.classList.toggle('layout-horizontal', !vertical);
}

function mostrarAviso(texto) {
  elVideo.hidden = true;
  elImg.hidden = true;
  if (!elVideo.paused) elVideo.pause();
  elStage.classList.remove('has-media');
  elAviso.hidden = false;
  elAviso.textContent = texto || '';
  urlAtual = null;
}

function mostrarMidia(media) {
  elAviso.hidden = true;
  elStage.classList.add('has-media');

  if (media.type === 'video') {
    elImg.hidden = true;
    if (media.url !== urlAtual) {
      elVideo.src = media.url;
      urlAtual = media.url;
    }
    elVideo.hidden = false;
    const p = elVideo.play();
    if (p && p.catch) p.catch(function () {});
  } else {
    if (!elVideo.paused) elVideo.pause();
    elVideo.hidden = true;
    if (media.url !== urlAtual) {
      elImg.src = media.url;
      urlAtual = media.url;
    }
    elImg.hidden = false;
  }
}

function aplicarEstado(estado) {
  if (!estado) return;
  aplicarLayout(estado.layout);
  if (estado.mode === 'media' && estado.media) {
    mostrarMidia(estado.media);
  } else {
    mostrarAviso(estado.message);
  }
}

function definirStatus(valor) {
  elStatus.dataset.state = valor;
}

// 1) Busca inicial via HTTP (caso o socket demore a conectar).
fetch('/api/state')
  .then((r) => r.json())
  .then(aplicarEstado)
  .catch(() => {});

// 2) Tempo real. O socket.io reconecta sozinho se a rede cair.
const socket = io();
socket.on('connect', () => definirStatus('connected'));
socket.on('disconnect', () => definirStatus('disconnected'));
socket.on('state', aplicarEstado);

// Tela cheia (o navegador exige um clique do usuario para permitir).
elFsBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    /* alguns dispositivos de TV nao suportam a API de fullscreen */
  }
});

// Esconde o cursor quando o mouse fica parado.
let timerCursor;
window.addEventListener('mousemove', () => {
  document.body.style.cursor = 'default';
  clearTimeout(timerCursor);
  timerCursor = setTimeout(() => {
    document.body.style.cursor = 'none';
  }, 3000);
});
