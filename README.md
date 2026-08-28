# Mural TV

Sistema de avisos para TV domestica, com atualizacao em tempo real.

- **`/tv`** &mdash; tela que fica na televisao (aberta, sem login).
- **`/admin`** &mdash; painel para enviar avisos e girar a tela (protegido por senha).

Feito com Node.js + Express + Socket.io. Sem banco de dados: o estado atual
(mensagem + orientacao) fica em `data/state.json`.

---

## 1. Rodar na sua maquina

Precisa de Node.js 18.17 ou mais novo.

```bash
npm install
cp .env.example .env        # no Windows: copy .env.example .env
```

Gere um segredo de sessao e cole no `.env` (linha `SESSION_SECRET`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Defina a senha do painel (troque `minhaSenha` pela sua):

```bash
npm run hash -- "minhaSenha"
```

Copie a linha `ADMIN_PASSWORD_HASH=...` que aparecer para o `.env`.

Suba o servidor:

```bash
npm run dev
```

Abra:

- TV:     http://localhost:4173/tv
- Painel: http://localhost:4173/admin

No painel, entre com a senha, escreva um aviso e clique em **Atualizar TV agora**.
A tela `/tv` muda na hora, sem recarregar.

---

## 2. Colocar na VPS (junto do app financeiro)

O app financeiro roda em `systemd` na porta 3000. Este projeto roda em
**PM2 numa porta separada (4173)** &mdash; se ele cair, o financeiro nao e afetado.

### 2.1. Codigo na VPS

```bash
cd /opt
git clone <url-do-repo> tv-avisos
cd tv-avisos
npm ci
```

### 2.2. Arquivo `.env` de producao

```bash
cp .env.example .env
nano .env
```

```
PORT=4173
SESSION_SECRET=<gere um novo, diferente do local>
ADMIN_PASSWORD_HASH=<gere com: npm run hash -- "senhaForte">
COOKIE_SECURE=true
TRUST_PROXY=1
```

### 2.3. Subir com PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # rode uma vez e siga a instrucao que ele imprimir
```

Comandos uteis: `pm2 status`, `pm2 logs tv-avisos`, `pm2 restart tv-avisos`.

### 2.4. Nginx (subdominio `tv.SEUDOMINIO`)

Crie **um novo arquivo** `/etc/nginx/sites-available/tv-avisos` (nao mexa nos
blocos que ja existem &mdash; financeiro, barbearia, MTA):

```nginx
server {
    listen 80;
    server_name tv.SEUDOMINIO;

    # Precisa ser >= MAX_UPLOAD_MB do .env, senao o Nginx corta o upload do video.
    client_max_body_size 600M;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;

        # necessario para o WebSocket (Socket.io) funcionar
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # uploads grandes: nao bufferiza tudo antes de repassar, e da mais tempo
        proxy_request_buffering off;
        proxy_read_timeout 600s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/tv-avisos /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Antes disso, aponte um registro DNS `A` de `tv.SEUDOMINIO` para o IP da VPS.

### 2.5. HTTPS com Certbot

```bash
certbot --nginx -d tv.SEUDOMINIO
```

O Certbot ajusta o bloco do Nginx para a porta 443 e renova sozinho.
Como o `.env` ja esta com `COOKIE_SECURE=true`, o cookie de login so vai
trafegar por HTTPS.

### 2.6. Atualizar depois de mudar o codigo

```bash
cd /opt/tv-avisos
git pull
npm ci
pm2 restart tv-avisos
```

---

## Estrutura

```
src/
  server.js     junta Express + HTTP + Socket.io; rotas de estado e de midia
  config.js     le e valida o .env
  auth.js       login/logout + "exige login" (sessao em cookie)
  state.js      o que esta na TV (aviso OU midia) + orientacao; grava data/state.json
  media.js      biblioteca de videos/imagens; grava data/media/ + data/media.json
  realtime.js   Socket.io: envia o estado para as TVs
public/
  tv.html   / css/tv.css   / js/tv.js      -> a tela da televisao
  admin.html / css/admin.css / js/admin.js -> o painel de controle
scripts/
  hash-senha.js  gera o hash bcrypt da senha
data/
  state.json     o que esta no ar agora (criado ao rodar; fora do git)
  media.json     lista das midias enviadas (fora do git)
  media/         os arquivos de video/imagem (fora do git)
  tmp/           arquivos temporarios de upload (fora do git)
```

## Midia (video / imagem)

- Pelo painel voce envia um `.mp4`/`.webm` ou `.jpg`/`.png`/`.webp`. Fica guardado
  no servidor e aparece na lista.
- "Mostrar" poe o item na TV (video toca em **loop e mudo**, em tela cheia).
  "Mostrar este aviso na TV" volta para o texto. So um item por vez.
- Limites no `.env`: `MAX_UPLOAD_MB` (padrao 500) por arquivo e `STORAGE_LIMIT_MB`
  (padrao 3072 = 3 GB) no total. A barra no painel mostra o espaco usado.
  Ao mudar `MAX_UPLOAD_MB`, ajuste tambem o `client_max_body_size` do Nginx.
- Os arquivos tem nomes unicos e sao servidos com cache longo em `/media/...`,
  entao a TV baixa o video uma vez e repete do cache (economiza banda da VPS).
- Dica: gravar em 1080p (nao 4K) e manter clipes curtos (~2 min).

## Seguranca &mdash; resumo

- Senha do painel guardada so como hash bcrypt (nunca em texto).
- Sessao em cookie `httpOnly` + `secure` (HTTPS) + `sameSite=lax`.
- Limite de 10 tentativas de login a cada 15 min por IP.
- Cabecalhos de seguranca via `helmet` (incluindo CSP restrita).
- Sockets sao so de leitura: toda alteracao passa por rotas `POST`/`DELETE`
  que exigem login (`/api/state`, `/api/media`).
- Fila de varios avisos com rodizio automatico.
- Segundo layout de conteudo (relogio, agenda, contagem regressiva).
