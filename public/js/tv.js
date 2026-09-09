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
const elNameTag = document.getElementById('nameTag');
const elStatus = document.getElementById('status');
const elFsBtn = document.getElementById('fsBtn');

let urlAtual = null;
let conectado = false;
let ultimoEstadoOk = Date.now();
let pollTimer = null;

// --- helpers ------------------------------------------------

function aplicarLayout(layout) {
  const vertical = layout === 'vertical';
  elStage.classList.toggle('layout-vertical', vertical);
  elStage.classList.toggle('layout-horizontal', !vertical);
}

function clamp(n, lo, hi, def) {
  n = Number(n);
  if (!isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

// Aparencia do nome (editavel no painel) --------------------
const FONTES_TV = {
  serif: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
  sans: '"Jost", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  impact: '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif',
  mono: 'ui-monospace, "Courier New", Consolas, monospace',
};

function hexRgba(hex, a) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return hex || 'transparent';
  return (
    'rgba(' +
    parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) +
    ',' + (a == null ? 0.82 : a) + ')'
  );
}

const POS_CLASSES = [
  'pos-bottom-left', 'pos-bottom-center', 'pos-bottom-right',
  'pos-top-left', 'pos-top-center', 'pos-top-right', 'pos-center',
];

function aplicarNameStyle(ns) {
  if (!ns) return;
  if (ns.color) elNameTag.style.color = ns.color;

  // "sem caixa" tambem quando a opacidade do fundo esta em zero
  const op = isFinite(Number(ns.bgOpacity)) ? Number(ns.bgOpacity) : 0.82;
  const comFundo = ns.showBg !== false && op > 0;
  elNameTag.classList.toggle('no-bg', !comFundo);
  elNameTag.style.background = comFundo ? hexRgba(ns.bg, op) : 'transparent';

  elNameTag.style.fontFamily = FONTES_TV[ns.font] || FONTES_TV.serif;

  const sz = Number(ns.sizeVmin);
  elNameTag.style.fontSize = (isFinite(sz) ? Math.min(12, Math.max(2, sz)) : 4.5) + 'vmin';

  const pos = 'pos-' + (ns.pos || 'bottom-left');
  POS_CLASSES.forEach(function (c) {
    elNameTag.classList.toggle(c, c === pos);
  });
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

function esconderNome() {
  elNameTag.hidden = true;
  elNameTag.classList.remove('fading');
}

// --- render de um estado simples --------------------------

function mostrarAviso(texto) {
  pararPlaylist();
  esconderNome();
  elVideo.hidden = true;
  elImg.hidden = true;
  pausarVideo();
  elStage.classList.remove('has-media');
  elAviso.hidden = false;
  elAviso.textContent = texto || '';
  urlAtual = null;
}

function mostrarMidia(media) {
  esconderNome();
  elAviso.hidden = true;
  elStage.classList.add('has-media');

  if (media.type === 'video') {
    elImg.hidden = true;
    if (media.url !== urlAtual) {
      elVideo.src = media.url;
      elVideo.load();
      urlAtual = media.url;
    }
    elVideo.loop = true; // modo "um item so": video em loop
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

// --- playlist (rodizio automatico) -----------------------

let playlistCtl = null; // { cancel }
let playlistSig = null;

function pararPlaylist() {
  if (playlistCtl) {
    playlistCtl.cancel();
    playlistCtl = null;
  }
  playlistSig = null;
}

function rodarPlaylist(items, settings, style, cmd) {
  const nameSec = clamp(settings.nameSec, 1, 30, 5);
  const photoSec = clamp(settings.photoSec, 2, 120, 10);
  const videoMaxSec = clamp(settings.videoMaxSec, 5, 600, 90);
  const nomeFixo = !!(style && style.alwaysOn);

  let i = 0;
  let cancelado = false;
  let timer = null;
  let timerNome = null;
  let lastSeq = cmd && cmd.seq != null ? cmd.seq : 0;

  const cancel = function () {
    cancelado = true;
    clearTimeout(timer);
    clearTimeout(timerNome);
    elVideo.onended = null;
    elVideo.onerror = null;
  };

  // Comando de transporte vindo do painel (◀ ▶ ⟲). So age quando o seq muda.
  const aplicarCmd = function (c) {
    if (!c || typeof c !== 'object' || c.seq == null || c.seq === lastSeq) return;
    lastSeq = c.seq;
    if (c.action === 'next') i = (i + 1) % items.length;
    else if (c.action === 'prev') i = (i - 1 + items.length) % items.length;
    else if (c.action === 'restart') i = 0;
    else if (c.action === 'goto') i = Math.max(0, Math.min(items.length - 1, c.index | 0));
    else return;
    clearTimeout(timer);
    elVideo.onended = null;
    elVideo.onerror = null;
    tocarItem();
  };

  function reportarPos() {
    if (cancelado) return;
    try {
      if (socket && socket.connected) {
        socket.emit('plpos', { i: i, total: items.length });
      } else {
        setTimeout(reportarPos, 1500); // socket ainda conectando -> tenta de novo
      }
    } catch (e) {
      /* ignora */
    }
  }

  playlistCtl = { cancel: cancel, aplicarCmd: aplicarCmd, reportar: reportarPos };

  function mostrarNome(txt) {
    clearTimeout(timerNome);
    if (!txt) {
      esconderNome();
      return;
    }
    elNameTag.textContent = txt;
    elNameTag.classList.remove('fading');
    elNameTag.hidden = false;
    if (nomeFixo) return; // "nome sempre visivel" -> nao some
    timerNome = setTimeout(function () {
      if (!cancelado) elNameTag.classList.add('fading');
    }, nameSec * 1000);
  }

  function proximo() {
    if (cancelado) return;
    clearTimeout(timer);
    elVideo.onended = null;
    elVideo.onerror = null;
    i = (i + 1) % items.length;
    tocarItem();
  }

  function tocarItem() {
    if (cancelado) return;
    const it = items[i];
    elAviso.hidden = true;
    elStage.classList.add('has-media');

    if (it.type === 'video') {
      elImg.hidden = true;
      if (it.url !== urlAtual) {
        elVideo.src = it.url;
        elVideo.load();
        urlAtual = it.url;
      }
      elVideo.loop = false; // na playlist, cada video toca UMA vez
      elVideo.hidden = false;
      tocarVideo();
      elVideo.onended = proximo;
      elVideo.onerror = function () {
        setTimeout(proximo, 3000);
      };
      timer = setTimeout(proximo, videoMaxSec * 1000); // teto
    } else {
      pausarVideo();
      elVideo.hidden = true;
      if (it.url !== urlAtual) {
        elImg.src = it.url;
        urlAtual = it.url;
      }
      elImg.hidden = false;
      timer = setTimeout(proximo, photoSec * 1000);
    }

    mostrarNome(it.title);
    reportarPos();
  }

  urlAtual = null; // forca recarregar o primeiro item
  tocarItem();
}

// --- aplica o estado recebido do servidor ---------------

function aplicarEstado(estado) {
  if (!estado || typeof estado !== 'object') return;
  ultimoEstadoOk = Date.now();
  aplicarLayout(estado.layout);

  if (estado.mode === 'playlist' && estado.playlist && estado.playlist.length) {
    const settings = estado.playSettings || {};
    const ns = estado.nameStyle || {};
    // cor / fundo / fonte do nome sao aplicados AO VIVO (nao reiniciam o rodizio)
    aplicarNameStyle(ns);
    const sig = JSON.stringify([
      estado.playlist.map(function (x) {
        return x.id + '|' + (x.title || '') + '|' + x.url;
      }),
      settings,
      !!ns.alwaysOn, // "sempre visivel" muda o comportamento -> entra na assinatura
    ]);
    const cmd = estado.playlistCmd || {};
    // mesma playlist ja rodando -> nao reinicia (poll/reconexao nao "pula")
    if (sig === playlistSig && playlistCtl) {
      // ...mas um comando de transporte (◀ ▶ ⟲) e aplicado sem reiniciar tudo
      if (playlistCtl.aplicarCmd) playlistCtl.aplicarCmd(cmd);
      return;
    }
    pararPlaylist();
    playlistSig = sig;
    rodarPlaylist(estado.playlist, settings, ns, cmd); // define playlistCtl internamente
  } else if (estado.mode === 'media' && estado.media) {
    pararPlaylist();
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
    if (playlistCtl && playlistCtl.reportar) playlistCtl.reportar(); // avisa a posicao ao painel
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
