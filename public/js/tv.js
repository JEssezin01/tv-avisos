// Player da TV: recebe o estado do servidor e mantem o telao SEMPRE no ar.
//
// Resiliencia (para rodar meses numa Smart TV):
//  - Socket.IO reconecta sozinho, em background, sem limite de tentativas.
//  - Se o WebSocket cair de vez, entra um poll HTTP a cada 15s.
//  - Ao voltar do standby / rede voltar, recupera o estado na hora.
//  - Se o video engasgar, tenta recarregar sozinho.
//  - Watchdog: 10 min sem nenhum estado e sem socket -> recarrega a pagina.
//  - Nada disso deixa a tela preta: o conteudo atual continua exibido.

const elStage = document.getElementById('stage');
const elAviso = document.getElementById('aviso');
const elVideo = document.getElementById('mediaVideo');
const elImg = document.getElementById('mediaImage');
const elStatus = document.getElementById('status');
const elFsBtn = document.getElementById('fsBtn');

let urlAtual = null;
let conectado = false;
let ultimoEstadoOk = Date.now();
let pollTimer = null;

// --- render ---------------------------------------------------

function aplicarLayout(layout) {
  const vertical = layout === 'vertical';
  elStage.classList.toggle('layout-vertical', vertical);
  elStage.classList.toggle('layout-horizontal', !vertical);
}

function pausarVideo() {
  try {
    if (!elVideo.paused) elVideo.pause();
  } catch (e) {
    /* alguns navegadores de TV reclamam; ignorar */
  }
}

function tocarVideo() {
  const p = elVideo.play();
  if (p && p.catch) p.catch(function () {});
}

function mostrarAviso(texto) {
  elVideo.hidden = true;
  elImg.hidden = true;
  pausarVideo();
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
      elVideo.load();
      urlAtual = media.url;
    }
    elVideo.hidden = false;
    tocarVideo();
  } else {
    pausarVideo();
    elVideo.hidden = true;
    if (media.url !== urlAtual) {
      elImg.src = media.url;
      urlAtual = media.url;
    }
    elImg.hidden = false;
  }
}

function aplicarEstado(estado) {
  if (!estado || typeof estado !== 'object') return;
  ultimoEstadoOk = Date.now();
  aplicarLayout(estado.layout);
  if (estado.mode === 'media' && estado.media) {
    mostrarMidia(estado.media);
  } else {
    mostrarAviso(estado.message);
  }
}

function definirStatus(v) {
  elStatus.dataset.state = v;
}

// --- estado por HTTP (primeira carga, fallback e recuperacao) --

function buscarEstado() {
  return fetch('/api/state', { cache: 'no-store' })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (s) {
      if (s) aplicarEstado(s);
    })
    .catch(function () {
      /* offline no momento; o proximo ciclo tenta de novo */
    });
}

function ligarPoll() {
  if (pollTimer) return;
  pollTimer = setInterval(buscarEstado, 15000);
}

function desligarPoll() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

// --- Socket.IO com reconexao silenciosa ----------------------

let socket = null;

if (typeof io === 'function') {
  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });

  socket.on('connect', function () {
    conectado = true;
    definirStatus('connected');
    desligarPoll();
    buscarEstado(); // pega o estado mais recente logo apos (re)conectar
  });

  const aoCair = function () {
    conectado = false;
    definirStatus('disconnected');
    ligarPoll(); // enquanto o socket nao volta, atualiza por HTTP
  };

  socket.on('disconnect', aoCair);
  socket.on('connect_error', aoCair);
  socket.io.on('reconnect_error', aoCair);
  socket.io.on('reconnect', function () {
    buscarEstado();
  });

  socket.on('state', aplicarEstado);
} else {
  // socket.io nao carregou (rede ruim no boot) -> vive so de HTTP.
  definirStatus('disconnected');
  ligarPoll();
}

// primeira carga imediata, antes mesmo do socket conectar
buscarEstado();

// --- voltar do standby / rede voltar ------------------------

function recuperar() {
  buscarEstado();
  if (socket && !socket.connected) socket.connect();
}

document.addEventListener('visibilitychange', function () {
  if (!document.hidden) recuperar();
});
window.addEventListener('online', recuperar);
window.addEventListener('pageshow', function () {
  buscarEstado();
});

// --- video resiliente --------------------------------------

elVideo.addEventListener('error', function () {
  if (!elVideo.hidden && urlAtual) {
    setTimeout(function () {
      if (!elVideo.hidden) {
        elVideo.load();
        tocarVideo();
      }
    }, 4000);
  }
});
elVideo.addEventListener('stalled', tocarVideo);
elVideo.addEventListener('canplay', tocarVideo);
elVideo.addEventListener('ended', tocarVideo); // reforca o loop

// --- watchdog: navegador travado -> recarrega -------------

setInterval(function () {
  const semEstadoHa = Date.now() - ultimoEstadoOk;
  if (!conectado && semEstadoHa > 10 * 60 * 1000) {
    location.reload();
  }
}, 60000);

// --- tela cheia + esconder cursor -------------------------

elFsBtn.addEventListener('click', async function () {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    /* algumas TVs nao suportam a API de fullscreen */
  }
});

let timerCursor;
window.addEventListener('mousemove', function () {
  document.body.style.cursor = 'default';
  clearTimeout(timerCursor);
  timerCursor = setTimeout(function () {
    document.body.style.cursor = 'none';
  }, 3000);
});
