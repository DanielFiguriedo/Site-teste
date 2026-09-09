# Loja do servidor de Minecraft

Loja online em português do Brasil para um servidor de Minecraft vender VIPs,
cash, kits/itens e chaves. Pagamento por **Pix** com confirmação automática.

A entrega é **manual**: quando o Pix é confirmado, o pedido entra numa fila no
painel, e o dono marca como entregue depois de dar o item no jogo. Isso está
dito de forma explícita para o comprador na home, no produto, no checkout e na
tela de pagamento — esconder isso só transferiria a frustração para o suporte.

Tudo roda em **um único Worker da Cloudflare**: o front-end (React + Vite) é
servido como asset estático e a API (Hono) atende `/api/*` no mesmo deploy.

---

## Como rodar na sua máquina

Requisitos: Node 20 ou mais novo.

```bash
npm install
cp .dev.vars.exemplo .dev.vars     # ajuste se quiser
npm run db:migrate:local           # cria as tabelas no D1 local
npm run db:seed:local              # produtos de exemplo
npm run dev                        # http://localhost:5173
```

Para entrar no painel, crie um usuário:

```bash
npm run admin:criar -- voce@exemplo.com "uma-senha-forte"
# copie o SQL impresso e rode:
npx wrangler d1 execute loja-minecraft --local --command "<o SQL>"
```

Depois acesse `http://localhost:5173/admin`.

Em desenvolvimento o provedor de pagamento é o **simulado**: a tela de pagamento
ganha um botão "Simular pagamento" que dispara um webhook assinado no endpoint
real. Isso existe porque o sandbox do Mercado Pago **não permite pagar um Pix de
verdade** — sem o simulador não haveria como exercitar o fluxo inteiro antes de
ir ao ar.

```bash
npm test          # 28 testes: dinheiro, estados do pedido, assinatura, senha
npm run typecheck
```

---

## Publicar na Cloudflare

Precisa de acesso à conta Cloudflare do dono do servidor. O free tier cobre
tudo com folga (D1: 5 GB, 5 milhões de leituras/dia).

### 1. Criar os recursos

```bash
npx wrangler login

npx wrangler d1 create loja-minecraft
npx wrangler r2 bucket create loja-minecraft-imagens
npx wrangler kv namespace create SESSIONS
```

Cada comando imprime um `id`. Copie-os para o `wrangler.jsonc`, nos lugares
marcados com `PREENCHER_...`.

### 2. Preparar o banco

```bash
npm run db:migrate:remote
npm run admin:criar -- dono@servidor.com "senha-forte-de-verdade"
npx wrangler d1 execute loja-minecraft --remote --command "<o SQL impresso>"
```

### 3. Configurar os segredos

Nenhum deles entra no `wrangler.jsonc`, que é versionado:

```bash
npx wrangler secret put SESSION_SECRET              # texto aleatório longo
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY        # opcional, anti-robô
```

### 4. Publicar

```bash
npm run deploy
```

### 5. Ligar o webhook no Mercado Pago

No painel do Mercado Pago, em **Suas integrações → Webhooks**, aponte para:

```
https://<seu-dominio>/api/webhook/pix
```

Marque o evento **Pagamentos**. O painel gera uma **chave secreta** — é ela que
vai em `MERCADOPAGO_WEBHOOK_SECRET`. Atenção: essa chave **não** é o access
token; são duas coisas diferentes, e trocá-las faz todo webhook ser recusado.

### 6. Teste final

O sandbox do Mercado Pago não paga Pix. Então o último teste é real: crie um
produto de **R$ 0,01**, compre, pague, confira que o pedido aparece como pago no
painel, e depois desative o produto.

---

## Onde mexer em quê

```
src/worker/          API, banco e pagamento
  routes/            catalog, checkout, orders, webhook, admin/*
  payments/          provider.ts (contrato) + mercadopago.ts + mock.ts
  lib/pedidos.ts     máquina de estados, criação de pedido, reconciliação
  db/schema.ts       fonte da verdade do banco (gere migration, não escreva SQL)
src/shared/          tipos e helpers usados pelos dois lados
src/app/             React: vitrine, checkout, pagamento
  admin/             painel
  styles/theme.css   design system (tokens)
```

Convenções e regras do projeto estão em `CLAUDE.md`, e o detalhamento em
`.claude/skills/`.

---

## O que fica de fora, de propósito

- **Entrega automática no jogo.** Está fora do escopo desta versão. Quando entrar,
  o gancho natural é o momento em que o pedido passa para `pago`
  (`marcarComoPago`, em `src/worker/lib/pedidos.ts`).
- **Carrinho com vários produtos.** Hoje a compra é de um produto por pedido. O
  banco já suporta vários itens (`pedido_itens`), então é só a interface.
- **Outros meios de pagamento.** Só Pix, como pedido. Trocar ou somar gateway é
  implementar `PaymentProvider` num arquivo novo.

---

## Aviso legal

Não somos afiliados à Mojang AB ou à Microsoft. Preencha os Termos de Uso e a
Política de Reembolso no painel antes de vender: no Brasil, o Código de Defesa
do Consumidor dá direito de arrependimento em 7 dias na compra à distância.
