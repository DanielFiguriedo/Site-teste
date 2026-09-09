# Loja de itens — servidor de Minecraft

Loja em português do Brasil para um servidor de Minecraft vender VIPs, cash,
kits/itens e chaves. Pagamento por **Pix** (Mercado Pago), com confirmação
automática por webhook. **A entrega é manual**: o dono vê os pedidos pagos numa
fila no painel e marca como entregue depois de dar o item no jogo.

Roda inteiro dentro de **um Worker da Cloudflare** — o front (React + Vite) é
servido como asset estático e a API (Hono) atende `/api/*` no mesmo deploy.

## Comandos

```bash
npm run dev              # Vite + workerd (runtime real do Worker)
npm run build            # typecheck + build
npm run db:migrate:local # aplica migrations no D1 local
npm run db:seed:local    # popula com dados de exemplo
npm run db:generate      # gera migration a partir do schema Drizzle
npx wrangler types       # regenera worker-configuration.d.ts
```

## Convenções inegociáveis

**Dinheiro é sempre inteiro em centavos.** Nunca float, em nenhuma camada —
banco, API ou UI. `R$ 29,90` é `2990`. Formatação só na borda, com
`formatarBRL()` de `src/shared/dinheiro.ts`.

**O preço nunca vem do cliente.** O checkout recebe `produtoId` e `quantidade`;
o Worker relê o preço no D1 e calcula o total. Aceitar valor enviado pelo
navegador é o buraco de segurança número 1 deste tipo de loja.

**Português do Brasil em tudo que o usuário vê**, e também nos nomes de tabelas,
colunas e identificadores do domínio (`pedidos`, `precoCentavos`, `nick`).
Termos técnicos consagrados ficam em inglês (`webhook`, `provider`, `slug`).

**Segredos nunca no repositório.** `.dev.vars` local (no `.gitignore`) e
`wrangler secret put` em produção. Nada de chave em `wrangler.jsonc`.

**Histórico de venda é imutável.** `pedido_itens` guarda nome e preço no momento
da compra. Mudar o preço de um produto não pode reescrever vendas antigas.

## Arquitetura

```
src/worker/    API Hono + acesso ao D1 + integração de pagamento
  routes/      catalog, checkout, orders, webhook, admin/*
  payments/    provider.ts (interface) + implementações trocáveis
  db/          schema Drizzle + client
src/shared/    tipos e helpers usados pelos dois lados
src/app/       React (rotas, componentes, design system)
```

O front conversa com a API só por `src/app/lib/api.ts`. Nenhum componente chama
`fetch` direto.

## Runtime

É Workers, não Node: sem `fs`, sem `path`, sem `Buffer` fora do
`nodejs_compat`. Criptografia é `crypto.subtle` (WebCrypto). Trabalho pesado
depois de responder vai em `ctx.waitUntil()`.

## Skills e agentes deste projeto

- `.claude/skills/design-system/` — tokens, componentes e regras visuais.
  **Leia antes de criar ou alterar qualquer tela.**
- `.claude/skills/pagamentos-pix/` — contrato do provider, máquina de estados do
  pedido e as regras de segurança do fluxo de pagamento.
- `.claude/skills/cloudflare-worker/` — bindings, migrations, secrets, deploy.
- Agente `ui-reviewer` — revisa telas contra o design system e acessibilidade.
- Agente `pagamento-auditor` — audita mudanças no fluxo de pagamento.
