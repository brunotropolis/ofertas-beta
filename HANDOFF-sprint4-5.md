# Sprint 4 (Fila + Dispatcher) e Sprint 5 (Ingestão) — handoff

Sessão de 12/Set/2026. Trabalho feito autônomo, **commitado local no `master` mas NÃO pushado** (deploy pra prod = passo de finalização com o Bruno).

## O que já existia (descoberto, o doc estava desatualizado)
O Sprint 4 **backend já estava pronto** em sessões anteriores:
- `src/lib/dispatcher.ts` — motor: por campanha ativa, respeita `timer_minutes`, pega item mais antigo da fila, publica em todos os grupos habilitados sorteando telefone não-admin, loga cada envio em `publication_log`, marca `published` quando todas as campanhas do item receberam.
- `POST /api/cron/tick` — heartbeat (header `x-cron-secret` = `CRON_SECRET`, já no `.env.local`). **Ainda não tem cron do n8n chamando** → a fila não dispara sozinha até isso ser ligado.
- `GET /api/queue`, `DELETE /api/queue/[id]`, `POST /api/queue/[id]/publish` (publicar agora).
- UI `/fila` (lista, publicar agora, excluir, auto-refresh 15s). Timer 5–120min já no modal de campanha.

## O que ESTA sessão adicionou

### Sprint 4 — fechado (app side)
- **Reordenar arrastando**: `PATCH /api/queue/reorder` (body `{ids:[...]}` → grava `position`) + `@dnd-kit` no `fila-client.tsx`. Item "Publicando" fica **travado** (cadeado, não arrasta). Salvamento otimista.
- **Histórico**: `GET /api/queue/history` (junta `publication_log` + nome da campanha + oferta, resumo 24h) → página `/historico` + `historico-client.tsx` (agrupado por dia, filtro todos/sucesso/erro, KPIs 24h). Link no nav e botão na fila.
- **`/publicacoes` ligada a dados reais** (era placeholder estático): `publicacoes-client.tsx` — filtro por fonte (Todas/Manual/Telegram/WhatsApp/Auto), cards com Enfileirar (modal multi-campanha + agendar) e Descartar. Rotas novas: `POST /api/ofertas/[id]/enqueue`, `DELETE /api/ofertas/[id]`, filtro `?source=` no `GET /api/ofertas`.

### Sprint 5 — núcleo de ingestão
- **`POST /api/ingest`** — porta de entrada das fontes automáticas. Server-to-server (header `x-ingest-secret` = `INGEST_SECRET` **ou** `CRON_SECRET` como fallback, então já funciona em prod sem mexer em env). Dedup por `(source, source_ref)` ou por `url` nas últimas 24h. Cria oferta `draft` (cai na aba Publicações pra curadoria) ou já enfileira se vier `campaign_ids`. Usa service role.
- Fix no dispatcher: `buildCaption` usa o **título** como fallback quando não tem `ai_caption` (ofertas de fonte automática não têm legenda).

## Contrato do /api/ingest (pros coletores)
```
POST /api/ingest
Header: x-ingest-secret: <CRON_SECRET>
Body: {
  "source": "telegram|whatsapp|auto",
  "source_ref": "<id único p/ dedup, ex: MLB123 ou msg_id>",
  "platform": "amazon|shopee|ml",
  "url": "https://...",
  "affiliate_url": "https://... (COM tag de afiliado)",
  "title": "...", "image_url": "...",
  "price_current": 0, "price_original": 0, "discount_pct": 0,
  "caption": "legenda pronta (opcional)",
  "campaign_ids": ["uuid"]   // opcional: se vier, já enfileira
}
```

## ✅ Teste em sandbox feito (12/Set) — 2 bugs de prod pegos
Testado ponta a ponta com os 2 grupos de teste do Buscador Geek (instância Evolution `ob-teste` no evo-v2, linkada ao nº 554184434952). A esteira pegou a oferta da fila → postou nos 2 grupos → logou success → marcou `published`. **2 bugs que quebrariam a produção:**
1. **Payload Evolution v1 → v2**: `sendText`/`sendMedia` usavam formato aninhado (`textMessage`/`mediaMessage`), rejeitado pelo evo-v2 com `400 "requires property text"`. **Corrigido** (commit `4c493ed`) pro formato flat da v2.
2. **URL do Evolution errada**: o app aponta pro Evolution ANTIGO (`evolution-evolution-api...`, morto). O certo é **evo-v2** (`https://evo-v2-evolution.xktssy.easypanel.host`) — mesma apikey. Corrigido no `.env.local` local; **falta corrigir na EasyPanel** (env de prod).

Setup de teste deixado no banco: campanha "TESTE — Sandbox Buscador Geek" (ativa, fila vazia = inócua), instância `ob-teste` conectada. Pra novos testes é só enfileirar e chamar o tick.

## Passos de FINALIZAÇÃO (precisam do Bruno — outward-facing / prod)
1. **Push + deploy** do `master` (auto-deploy EasyPanel). Nada de migration nova — o schema já suportava tudo (`offers.source`, `publication_queue.position`, `publication_log`). ⚠️ **Trocar `EVOLUTION_API_URL` na EasyPanel** pro evo-v2 (senão o envio real não funciona — o app está apontando pro Evolution morto).
2. **Ligar o heartbeat**: workflow n8n cron (1min) → `POST https://app.buscadorgeek.com.br/api/cron/tick` com header `x-cron-secret`. Sem isso a fila não dispara sozinha (só o botão "Publicar agora" funciona). ⚠️ isso liga envio REAL de WhatsApp — validar com telefone/grupo de teste antes.
3. **(Opcional) `INGEST_SECRET` dedicado** em `.env.local` + EasyPanel (hoje cai no `CRON_SECRET`).
4. **Wiring das fontes** (Sprint 5 completo): apontar os coletores que **já geram link de afiliado** (o "ML Auto" `hg63h2u3bBibMAuu`, Shopee/Amazon do Buscador Geek) pra `POST /api/ingest`. Um coletor ML ingênuo via API pública NÃO serve — a API pública não gera link de afiliado (só cookie/scraping), viraria tráfego sem comissão.
5. **Teste E2E autenticado** de `/fila` (drag), `/historico`, `/publicacoes` (não deu pra testar logado nesta sessão — regra de não inserir senha).

## Verificação feita
- `npm run build` limpo (todas as rotas novas compilaram).
- Dev server sobe, `/login` renderiza, sem erro de servidor/console.
