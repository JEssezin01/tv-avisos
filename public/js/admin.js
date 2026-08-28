// Painel de controle: login, aviso de texto, orientacao e midias.

const loginView = document.getElementById('loginView');
const panelView = document.getElementById('panelView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const senhaInput = document.getElementById('senha');
const logoutBtn = document.getElementById('logoutBtn');

const nowWhat = document.getElementById('nowWhat');
const segLayout = document.getElementById('segLayout');
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

const okMsg = document.getElementById('okMsg');

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
    pintarEstado(s);
  } catch {
    /* painel abre mesmo sem estado carregado */
  }
}

function pintarEstado(s) {
  segLayout.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === s.layout);
  });

  if (s.mode === 'media' && s.media) {
    const rotulo = s.media.type === 'video' ? 'video' : 'imagem';
    nowWhat.textContent = rotulo + ': ' + (s.media.name || '');
  } else {
    nowWhat.textContent = 'aviso de texto';
  }

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

    const delBtn = document.createElement('button');
    delBtn.className = 'mi-del';
    delBtn.type = 'button';
    delBtn.textContent = 'Apagar';
    delBtn.addEventListener('click', () => confirmarApagar(delBtn, item.id));

    li.append(info, showBtn, delBtn);
    mediaList.append(li);
  }
}

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

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) enviarArquivo(file);
});

function enviarArquivo(file) {
  mediaErr.textContent = '';
  progress.hidden = false;
  progressBar.style.width = '0%';
  fileBtnText.textContent = 'Enviando…';

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
    progress.hidden = true;
    fileBtnText.textContent = 'Escolher do celular…';
    fileInput.value = '';
    if (xhr.status === 201) {
      carregarMidias();
      flashOk('Enviado ✓');
    } else if (xhr.status === 401) {
      atualizarSessao();
    } else {
      let msg = 'Falha no envio.';
      try {
        msg = JSON.parse(xhr.responseText).error || msg;
      } catch {
        /* mantem msg padrao */
      }
      mediaErr.textContent = msg;
    }
  };

  xhr.onerror = () => {
    progress.hidden = true;
    fileBtnText.textContent = 'Escolher do celular…';
    mediaErr.textContent = 'Erro de conexao no envio.';
  };

  xhr.send(fd);
}

// ---- inicio ------------------------------------------------

atualizarSessao();
