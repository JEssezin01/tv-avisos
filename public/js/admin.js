// Painel de controle: login, aviso de texto, orientacao e midias.

const loginView = document.getElementById('loginView');
const panelView = document.getElementById('panelView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const senhaInput = document.getElementById('senha');
const logoutBtn = document.getElementById('logoutBtn');

const nowWhat = document.getElementById('nowWhat');
const segLayout = document.getElementById('segLayout');
const segRotate = document.getElementById('segRotate');
const messageEl = document.getElementById('message');
const showAvisoBtn = document.getElementById('showAvisoBtn');

const fileInput = document.getElementById('fileInput');
const fileBtnText = document.getElementById('fileBtnText');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const mediaHint = document.getElementById('mediaHint');
const mediaErr = document.getElementById('mediaErr');
const mediaList = document.getElementById('mediaList');
const storageFill = document.getElementById('storageFill');
const storageText = document.getElementById('storageText');

const plList = document.getElementById('plList');
const plHint = document.getElementById('plHint');
const plName = document.getElementById('plName');
const plPhoto = document.getElementById('plPhoto');
const plVideoMax = document.getElementById('plVideoMax');
const playPlaylistBtn = document.getElementById('playPlaylistBtn');

const nsColor = document.getElementById('nsColor');
const nsBg = document.getElementById('nsBg');
const nsFont = document.getElementById('nsFont');
const nsBgOp = document.getElementById('nsBgOp');
const nsBgOpVal = document.getElementById('nsBgOpVal');
const nsShowBg = document.getElementById('nsShowBg');
const nsBgFields = document.getElementById('nsBgFields');
const nsPos = document.getElementById('nsPos');
const nsSize = document.getElementById('nsSize');
const nsSizeVal = document.getElementById('nsSizeVal');
const nsAlways = document.getElementById('nsAlways');
const namePreview = document.getElementById('namePreview');
const namePreviewBox = document.getElementById('namePreviewBox');

const plControl = document.getElementById('plControl');
const plProgress = document.getElementById('plProgress');
const plPos = document.getElementById('plPos');
const plRestart = document.getElementById('plRestart');
const plPrev = document.getElementById('plPrev');
const plNext = document.getElementById('plNext');

const onairDot = document.getElementById('onairDot');
const libMeta = document.getElementById('libMeta');
const plMeta = document.getElementById('plMeta');

const schEnabled = document.getElementById('schEnabled');
const schFields = document.getElementById('schFields');
const schOpen = document.getElementById('schOpen');
const schClose = document.getElementById('schClose');
const schDays = document.getElementById('schDays');
const schMsg = document.getElementById('schMsg');
const schNow = document.getElementById('schNow');
const schMeta = document.getElementById('schMeta');

const okMsg = document.getElementById('okMsg');

// Copia de trabalho (sincronizada com o servidor).
let playlist = []; // [{ id, title }]
let playSettings = { nameSec: 5, photoSec: 10, videoMaxSec: 90 };
let nameStyle = {
  color: '#f2e6dc',
  bg: '#071633',
  bgOpacity: 0.82,
  showBg: true,
  font: 'serif',
  sizeVmin: 4.5,
  pos: 'bottom-left',
  alwaysOn: false,
};
let libItems = []; // ultimo /api/media (para achar nome ao adicionar)
let schedule = {
  enabled: false,
  open: '08:00',
  close: '19:00',
  days: [1, 2, 3, 4, 5, 6],
  closedMessage: 'Fechado',
};

// Posicao -> alinhamento dentro da previa (flex).
const PREVIEW_ALIGN = {
  'bottom-left': ['flex-end', 'flex-start'],
  'bottom-center': ['flex-end', 'center'],
  'bottom-right': ['flex-end', 'flex-end'],
  'top-left': ['flex-start', 'flex-start'],
  'top-center': ['flex-start', 'center'],
  'top-right': ['flex-start', 'flex-end'],
  center: ['center', 'center'],
};

const FONTES_ADMIN = {
  serif: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
  sans: '"Jost", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  impact: '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif',
  mono: 'ui-monospace, "Courier New", Consolas, monospace',
};

function hexRgba(hex, a) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return hex || 'transparent';
  return (
    'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) +
    ',' + (a == null ? 0.82 : a) + ')'
  );
}

// ---- utilidades -------------------------------------------------

function mb(bytes) {
  return bytes / (1024 * 1024);
}

function formatoTamanho(bytes) {
  const m = mb(bytes);
  if (m >= 1024) return (m / 1024).toFixed(1).replace('.', ',') + ' GB';
  if (m >= 1) return Math.round(m) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function flashOk(texto) {
  okMsg.textContent = texto;
  clearTimeout(flashOk._t);
  flashOk._t = setTimeout(() => {
    okMsg.textContent = '';
  }, 2500);
}

// Feedback visual imediato no proprio botao.
// fase: 'enviando' | 'ok' | 'erro'. `texto` opcional troca o rotulo no 'ok'/'erro'.
function pulsoBotao(btn, fase, texto) {
  if (!btn) return;
  clearTimeout(btn._pulso);
  btn.classList.remove('is-sending', 'is-ok', 'is-fail');

  if (fase === 'enviando') {
    if (btn.dataset.rotulo == null) btn.dataset.rotulo = btn.textContent;
    btn.classList.add('is-sending');
    btn.disabled = true;
    return;
  }

  btn.disabled = false;
  btn.classList.add(fase === 'ok' ? 'is-ok' : 'is-fail');
  const original = btn.dataset.rotulo != null ? btn.dataset.rotulo : btn.textContent;
  if (texto) btn.textContent = texto;

  btn._pulso = setTimeout(() => {
    btn.classList.remove('is-ok', 'is-fail');
    btn.textContent = original;
    delete btn.dataset.rotulo;
  }, 1100);
}

// ---- sessao ---------------------------------------------------

async function atualizarSessao() {
  let authed = false;
  try {
    authed = (await fetch('/auth/me').then((r) => r.json())).authed === true;
  } catch {
    authed = false;
  }
  loginView.hidden = authed;
  panelView.hidden = !authed;
  if (authed) {
    carregarEstado();
    carregarMidias();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  try {
    const r = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: senhaInput.value }),
    });
    if (r.ok) {
      senhaInput.value = '';
      atualizarSessao();
    } else {
      const data = await r.json().catch(() => ({}));
      loginError.textContent = data.error || 'Nao foi possivel entrar.';
    }
  } catch {
    loginError.textContent = 'Erro de conexao. Tente de novo.';
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/auth/logout', { method: 'POST' });
  } catch {
    /* ignora */
  }
  atualizarSessao();
});

// ---- estado do telao ----------------------------------------

async function carregarEstado() {
  try {
    const s = await fetch('/api/state').then((r) => r.json());
    messageEl.value = s.message || '';
    if (Array.isArray(s.playlist)) {
      playlist = s.playlist.map((p) => ({ id: p.id, title: p.title || '' }));
    }
    if (s.playSettings) playSettings = { ...playSettings, ...s.playSettings };
    if (s.nameStyle) nameStyle = { ...nameStyle, ...s.nameStyle };
    if (s.schedule) {
      schedule = {
        ...schedule,
        ...s.schedule,
        days: Array.isArray(s.schedule.days) ? s.schedule.days.map(Number) : schedule.days,
      };
    }
    plName.value = playSettings.nameSec;
    plPhoto.value = playSettings.photoSec;
    plVideoMax.value = playSettings.videoMaxSec;
    renderNameStyle();
    renderPlaylist();
    renderSchedule();
    pintarEstado(s);
  } catch {
    /* painel abre mesmo sem estado carregado */
  }
}

function pintarEstado(s) {
  segLayout.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === s.layout);
  });
  if (segRotate) {
    const rot = String(s.videoRotate == null ? 0 : s.videoRotate);
    segRotate.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.rot === rot);
    });
  }

  const sc = s.schedule || schedule;
  const fechadoAgora = !!(sc && sc.enabled && !estaAbertoAdmin(sc));

  const emPlaylist = s.mode === 'playlist' && s.playlist && s.playlist.length;
  plControl.hidden = !emPlaylist || fechadoAgora;
  if (emPlaylist && !fechadoAgora && s.playlistPos) {
    atualizarPosicao(s.playlistPos.i || 0, s.playlistPos.total || playlist.length);
  }

  if (fechadoAgora) {
    nowWhat.textContent = 'Fechado (fora do horário)';
  } else if (emPlaylist) {
    nowWhat.textContent = 'Playlist — ' + s.playlist.length + ' itens em rodízio';
  } else if (s.mode === 'media' && s.media) {
    const rotulo = s.media.type === 'video' ? 'Vídeo' : 'Imagem';
    nowWhat.textContent = rotulo + ' — ' + (s.media.name || '');
  } else {
    nowWhat.textContent = 'Aviso de texto';
  }
  if (onairDot) onairDot.classList.toggle('is-live', s.mode !== 'aviso' && !fechadoAgora);

  destacarMidiaNoAr(s.mode === 'media' && s.media ? s.media.id : null);
}

async function enviarEstado(patch) {
  try {
    const r = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (r.status === 401) {
      atualizarSessao();
      return null;
    }
    if (!r.ok) {
      flashOk('');
      mediaErr.textContent = 'Nao foi possivel atualizar a TV.';
      return null;
    }
    const s = await r.json();
    pintarEstado(s);
    return s;
  } catch {
    mediaErr.textContent = 'Erro de conexao.';
    return null;
  }
}

segLayout.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-layout]');
  if (!btn) return;
  pulsoBotao(btn, 'enviando');
  const s = await enviarEstado({ layout: btn.dataset.layout });
  pulsoBotao(btn, s ? 'ok' : 'erro'); // botao estreito: so muda a cor
});

if (segRotate) {
  segRotate.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-rot]');
    if (!btn) return;
    pulsoBotao(btn, 'enviando');
    const s = await enviarEstado({ videoRotate: Number(btn.dataset.rot) });
    pulsoBotao(btn, s ? 'ok' : 'erro');
    if (s) flashOk('Rotação do vídeo atualizada.');
  });
}

showAvisoBtn.addEventListener('click', async () => {
  pulsoBotao(showAvisoBtn, 'enviando');
  const s = await enviarEstado({ mode: 'aviso', message: messageEl.value });
  pulsoBotao(showAvisoBtn, s ? 'ok' : 'erro', s ? 'Enviado ✓' : 'Erro');
  if (s) flashOk('Aviso no ar.');
});

// ---- midias -------------------------------------------------

async function carregarMidias() {
  try {
    const data = await fetch('/api/media').then((r) => r.json());
    renderStorage(data.usage);
    renderLista(data.items);
  } catch {
    /* ignora */
  }
}

function renderStorage(usage) {
  const pct = usage.limitBytes ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0;
  storageFill.style.width = pct.toFixed(0) + '%';
  storageFill.classList.toggle('full', pct >= 95);
  storageText.textContent =
    formatoTamanho(usage.usedBytes) + ' de ' + formatoTamanho(usage.limitBytes);
  mediaHint.textContent =
    'Video .mp4/.webm/.mov ou imagem .jpg/.png/.webp · ate ' +
    Math.round(mb(usage.maxFileBytes)) +
    ' MB por arquivo';
}

function renderLista(items) {
  libItems = items;
  if (libMeta) libMeta.textContent = items.length ? String(items.length) : '';
  mediaList.textContent = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.dataset.id = item.id;

    const info = document.createElement('div');
    info.className = 'mi-info';
    const nome = document.createElement('span');
    nome.className = 'mi-name';
    nome.textContent = item.name;
    const meta = document.createElement('span');
    meta.className = 'mi-meta';
    meta.textContent = (item.type === 'video' ? 'video' : 'imagem') + ' · ' + formatoTamanho(item.size);
    info.append(nome, meta);

    const showBtn = document.createElement('button');
    showBtn.className = 'mi-show';
    showBtn.type = 'button';
    showBtn.textContent = 'Mostrar';
    showBtn.addEventListener('click', async () => {
      pulsoBotao(showBtn, 'enviando');
      const s = await enviarEstado({ mode: 'media', mediaId: item.id });
      pulsoBotao(showBtn, s ? 'ok' : 'erro', s ? '✓' : 'Erro');
      if (s) flashOk('No ar: ' + item.name);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'mi-add';
    addBtn.type = 'button';
    const naPlaylist = playlist.some((p) => p.id === item.id);
    addBtn.classList.toggle('on', naPlaylist);
    addBtn.textContent = naPlaylist ? '✓ playlist' : '+ Playlist';
    addBtn.addEventListener('click', () => alternarNaPlaylist(item));

    const delBtn = document.createElement('button');
    delBtn.className = 'mi-del';
    delBtn.type = 'button';
    delBtn.textContent = 'Apagar';
    delBtn.addEventListener('click', () => confirmarApagar(delBtn, item.id));

    li.append(info, showBtn, addBtn, delBtn);
    mediaList.append(li);
  }
}

// ---- playlist (rodizio) -----------------------------------

function alternarNaPlaylist(item) {
  const i = playlist.findIndex((p) => p.id === item.id);
  if (i === -1) playlist.push({ id: item.id, title: item.name || '' });
  else playlist.splice(i, 1);
  renderPlaylist();
  renderLista(libItems); // atualiza os botoes "+ Playlist"
  salvarPlaylist(true);
}

function renderPlaylist() {
  plList.textContent = '';
  playlist.forEach((p, idx) => {
    const li = document.createElement('li');

    const title = document.createElement('input');
    title.className = 'pl-title';
    title.type = 'text';
    title.maxLength = 120;
    title.value = p.title;
    title.placeholder = 'Nome do item';
    title.addEventListener('input', () => {
      p.title = title.value;
      salvarPlaylist(false); // debounced
    });

    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.disabled = idx === 0;
    up.addEventListener('click', () => moverPlaylist(idx, -1));

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.disabled = idx === playlist.length - 1;
    down.addEventListener('click', () => moverPlaylist(idx, 1));

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.textContent = '✕';
    rm.addEventListener('click', () => {
      playlist.splice(idx, 1);
      renderPlaylist();
      renderLista(libItems);
      salvarPlaylist(true);
    });

    li.append(title, up, down, rm);
    plList.append(li);
  });

  plHint.hidden = playlist.length > 0;
  playPlaylistBtn.disabled = playlist.length === 0;
  if (plMeta) plMeta.textContent = playlist.length ? String(playlist.length) : '';
}

function moverPlaylist(idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= playlist.length) return;
  const tmp = playlist[idx];
  playlist[idx] = playlist[j];
  playlist[j] = tmp;
  renderPlaylist();
  salvarPlaylist(true);
}

function lerDuracoes() {
  const num = (el, lo, hi, def) => {
    const n = Math.round(Number(el.value));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  playSettings = {
    nameSec: num(plName, 1, 30, 5),
    photoSec: num(plPhoto, 2, 120, 10),
    videoMaxSec: num(plVideoMax, 5, 600, 90),
  };
}

// ---- estilo do nome --------------------------------------

function renderNameStyle() {
  nsColor.value = nameStyle.color || '#f2e6dc';
  nsBg.value = nameStyle.bg || '#071633';
  nsFont.value = nameStyle.font || 'serif';
  nsBgOp.value = Math.round((nameStyle.bgOpacity != null ? nameStyle.bgOpacity : 0.82) * 100);
  nsShowBg.checked = nameStyle.showBg !== false;
  nsPos.value = nameStyle.pos || 'bottom-left';
  nsSize.value = nameStyle.sizeVmin != null ? nameStyle.sizeVmin : 4.5;
  nsAlways.checked = !!nameStyle.alwaysOn;
  atualizarPreview();
}

function atualizarPreview() {
  // os campos de fundo aparecem se o checkbox estiver marcado;
  // mas o "visual com caixa" so vale se tambem tiver opacidade > 0
  nsBgFields.hidden = !nsShowBg.checked;
  const comFundo = nsShowBg.checked && Number(nsBgOp.value) > 0;
  nsBgOpVal.textContent = nsBgOp.value + '%';
  nsSizeVal.textContent = nsSize.value;

  // tamanho na previa: vmin -> px (a caixa e pequena, entao escala reduzida)
  const px = Math.min(34, Math.max(12, Number(nsSize.value) * 3));
  namePreview.style.color = nsColor.value;
  namePreview.style.fontFamily = FONTES_ADMIN[nsFont.value] || FONTES_ADMIN.serif;
  namePreview.style.fontSize = px + 'px';
  if (comFundo) {
    namePreview.style.background = hexRgba(nsBg.value, Number(nsBgOp.value) / 100);
    namePreview.style.borderLeft = '3px solid #c9a227';
    namePreview.style.paddingLeft = '';
    namePreview.style.textShadow = 'none';
  } else {
    namePreview.style.background = 'transparent';
    namePreview.style.borderLeft = '0';
    namePreview.style.paddingLeft = '0';
    namePreview.style.textShadow = '0 2px 10px rgba(0,0,0,.75), 0 0 3px rgba(0,0,0,.95)';
  }

  const al = PREVIEW_ALIGN[nsPos.value] || PREVIEW_ALIGN['bottom-left'];
  namePreviewBox.style.alignItems = al[0];
  namePreviewBox.style.justifyContent = al[1];
}

function lerNameStyle() {
  nameStyle = {
    color: nsColor.value,
    bg: nsBg.value,
    bgOpacity: Number(nsBgOp.value) / 100,
    showBg: nsShowBg.checked,
    font: nsFont.value,
    sizeVmin: Number(nsSize.value),
    pos: nsPos.value,
    alwaysOn: nsAlways.checked,
  };
}

// arrastar cor/opacidade/tamanho: preview ao vivo + salva com debounce
[nsColor, nsBg, nsBgOp, nsSize].forEach((el) => {
  el.addEventListener('input', () => {
    lerNameStyle();
    atualizarPreview();
    salvarPlaylist(false);
  });
});
// selects e checkboxes: salva na hora
[nsFont, nsPos, nsShowBg, nsAlways].forEach((el) => {
  el.addEventListener('change', () => {
    lerNameStyle();
    atualizarPreview();
    salvarPlaylist(true);
  });
});

async function salvarPlaylist(imediato) {
  lerDuracoes();
  lerNameStyle();
  const enviar = () =>
    enviarEstado({
      playlist: playlist.map((p) => ({ id: p.id, title: p.title })),
      playSettings,
      nameStyle,
    });
  clearTimeout(salvarPlaylist._t);
  if (imediato) {
    await enviar();
  } else {
    salvarPlaylist._t = setTimeout(enviar, 500);
  }
}

[plName, plPhoto, plVideoMax].forEach((el) => {
  el.addEventListener('change', () => salvarPlaylist(true));
});

playPlaylistBtn.addEventListener('click', async () => {
  lerDuracoes();
  lerNameStyle();
  pulsoBotao(playPlaylistBtn, 'enviando');
  const s = await enviarEstado({
    mode: 'playlist',
    playlist: playlist.map((p) => ({ id: p.id, title: p.title })),
    playSettings,
    nameStyle,
  });
  pulsoBotao(playPlaylistBtn, s ? 'ok' : 'erro', s ? 'Tocando ✓' : 'Erro');
  if (s) flashOk('Playlist no ar (' + playlist.length + ' itens).');
  setTimeout(pollPosicao, 500);
});

// ---- horario de funcionamento ---------------------------

// Espelho do estaAberto() do tv.js (mesma regra, inclusive faixa que vira a noite).
function estaAbertoAdmin(sc) {
  if (!sc || !sc.enabled) return true;
  const hm = (v) => {
    const m = /^(\d{2}):(\d{2})$/.exec(String(v || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const o = hm(sc.open);
  const c = hm(sc.close);
  if (o == null || c == null || o === c) return true;
  const dias = Array.isArray(sc.days) ? sc.days.map(Number) : [];
  const agora = new Date();
  const min = agora.getHours() * 60 + agora.getMinutes();
  const hoje = agora.getDay();
  if (o < c) return dias.indexOf(hoje) !== -1 && min >= o && min < c;
  if (min >= o) return dias.indexOf(hoje) !== -1;
  if (min < c) return dias.indexOf((hoje + 6) % 7) !== -1;
  return false;
}

// Le o formulario (fonte da verdade depois que a tela ja carregou).
function formSchedule() {
  const dias = [];
  schDays.querySelectorAll('input[type="checkbox"]').forEach((c) => {
    if (c.checked) dias.push(Number(c.value));
  });
  return {
    enabled: schEnabled.checked,
    open: schOpen.value || '08:00',
    close: schClose.value || '19:00',
    days: dias,
    closedMessage: (schMsg.value || '').trim() || 'Fechado',
  };
}

function renderSchedule() {
  schEnabled.checked = !!schedule.enabled;
  schFields.hidden = !schedule.enabled;
  schOpen.value = schedule.open || '08:00';
  schClose.value = schedule.close || '19:00';
  const set = new Set(Array.isArray(schedule.days) ? schedule.days.map(Number) : []);
  schDays.querySelectorAll('input[type="checkbox"]').forEach((c) => {
    c.checked = set.has(Number(c.value));
  });
  schMsg.value = schedule.closedMessage || '';
  atualizarSchNow();
}

// So mexe no aviso "agora esta aberto/fechado" — nao briga com a edicao.
function atualizarSchNow() {
  if (panelView.hidden) return;
  const sc = formSchedule();
  if (!sc.enabled) {
    schNow.textContent = 'Desligado — a TV mostra o conteúdo normal o tempo todo.';
    if (schMeta) schMeta.textContent = '';
    return;
  }
  const aberto = estaAbertoAdmin(sc);
  schNow.textContent = aberto
    ? 'Agora: dentro do horário — a TV mostra o conteúdo normal.'
    : 'Agora: fora do horário — a TV mostra "' + sc.closedMessage + '".';
  if (schMeta) schMeta.textContent = aberto ? 'aberto agora' : 'fechado agora';
}

async function salvarSchedule(imediato) {
  schedule = formSchedule();
  const enviar = () => enviarEstado({ schedule });
  clearTimeout(salvarSchedule._t);
  if (imediato) await enviar();
  else salvarSchedule._t = setTimeout(enviar, 500);
}

schEnabled.addEventListener('change', () => {
  schFields.hidden = !schEnabled.checked;
  atualizarSchNow();
  salvarSchedule(true);
});
[schOpen, schClose, schMsg].forEach((el) => {
  el.addEventListener('input', () => {
    atualizarSchNow();
    salvarSchedule(false);
  });
});
schDays.addEventListener('change', () => {
  atualizarSchNow();
  salvarSchedule(true);
});
setInterval(atualizarSchNow, 20000); // reavalia "aberto/fechado" com o relogio andando

// ---- controle do rodizio (◀ ▶ ⟲ + barrinha) --------------

function atualizarPosicao(i, total) {
  const n = total || playlist.length || 0;
  i = Math.max(0, Math.min(n - 1, i | 0));

  plProgress.textContent = '';
  for (let k = 0; k < n; k++) {
    const seg = document.createElement('span');
    seg.className = 'pl-seg' + (k === i ? ' on' : k < i ? ' done' : '');
    plProgress.append(seg);
  }

  const titulo = playlist[i] ? playlist[i].title : '';
  plPos.textContent = n
    ? 'Tocando: item ' + (i + 1) + ' de ' + n + (titulo ? ' — ' + titulo : '')
    : '';

  const linhas = plList.children;
  for (let k = 0; k < linhas.length; k++) {
    linhas[k].classList.toggle('tocando', k === i);
  }
}

async function pollPosicao() {
  if (panelView.hidden) return;
  let s;
  try {
    s = await fetch('/api/state').then((r) => r.json());
  } catch {
    return;
  }
  pintarEstado(s); // cuida do rodizio E do status "fechado (fora do horario)"
}
setInterval(pollPosicao, 2500);

async function comandoPlaylist(btn, action) {
  pulsoBotao(btn, 'enviando');
  const s = await enviarEstado({ playlistCmd: { action } });
  pulsoBotao(btn, s ? 'ok' : 'erro');
  if (s && s.playlistPos) {
    atualizarPosicao(s.playlistPos.i || 0, s.playlistPos.total || playlist.length);
  }
  setTimeout(pollPosicao, 400); // pega a posicao nova depois que a TV reporta
}

plRestart.addEventListener('click', () => comandoPlaylist(plRestart, 'restart'));
plPrev.addEventListener('click', () => comandoPlaylist(plPrev, 'prev'));
plNext.addEventListener('click', () => comandoPlaylist(plNext, 'next'));

function destacarMidiaNoAr(id) {
  mediaList.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('on', li.dataset.id === id);
  });
}

function confirmarApagar(btn, id) {
  if (btn.dataset.armed) {
    apagarMidia(id);
    return;
  }
  btn.dataset.armed = '1';
  btn.textContent = 'Confirmar?';
  setTimeout(() => {
    if (btn.isConnected) {
      btn.dataset.armed = '';
      btn.textContent = 'Apagar';
    }
  }, 4000);
}

async function apagarMidia(id) {
  try {
    const r = await fetch('/api/media/' + id, { method: 'DELETE' });
    if (r.status === 401) {
      atualizarSessao();
      return;
    }
  } catch {
    mediaErr.textContent = 'Erro ao apagar.';
    return;
  }
  await carregarMidias();
  await carregarEstado(); // a TV pode ter voltado para o aviso
}

fileInput.addEventListener('change', async () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  if (!files.length) return;

  mediaErr.textContent = '';
  let enviados = 0;
  for (let k = 0; k < files.length; k++) {
    const ok = await enviarArquivo(files[k], k + 1, files.length);
    if (ok) enviados++;
  }
  progress.hidden = true;
  fileBtnText.textContent = 'Escolher do celular…';
  await carregarMidias();
  if (enviados) flashOk(enviados + (enviados > 1 ? ' enviados ✓' : ' enviado ✓'));
});

// Envia UM arquivo. Resolve true/false (nao rejeita), para o loop seguir.
function enviarArquivo(file, n, total) {
  return new Promise((resolve) => {
    progress.hidden = false;
    progressBar.style.width = '0%';
    fileBtnText.textContent =
      total > 1 ? 'Enviando ' + n + '/' + total + '…' : 'Enviando…';

    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        progressBar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve(true);
      } else if (xhr.status === 401) {
        atualizarSessao();
        resolve(false);
      } else {
        let msg = 'Falha no envio.';
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {
          /* mantem msg padrao */
        }
        mediaErr.textContent = (total > 1 ? '"' + file.name + '": ' : '') + msg;
        resolve(false);
      }
    };

    xhr.onerror = () => {
      mediaErr.textContent = 'Erro de conexao no envio.';
      resolve(false);
    };

    xhr.send(fd);
  });
}

// ---- inicio ------------------------------------------------

atualizarSessao();
