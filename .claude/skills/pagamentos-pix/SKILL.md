---
name: pagamentos-pix
description: Contrato do provedor de pagamento, máquina de estados do pedido e regras de segurança do fluxo Pix (Mercado Pago). Use ao mexer em checkout, webhook, status de pedido, reconciliação por cron ou em qualquer código que toque em dinheiro.
---

# Pagamento Pix

Gateway: **Mercado Pago** (0,99% sem mínimo, cadastro com CPF, API REST com
Bearer). A integração fica atrás de uma interface para poder ser trocada.

## Regras que não se negociam

**1. O preço nunca vem do cliente.**
O checkout aceita `produtoId` e `quantidade`. O total é recalculado no Worker
lendo o preço do D1. Se algum dia um valor chegar do navegador e for usado, a
loja pode ser comprada por R$ 0,01.

**2. Dinheiro é inteiro em centavos** em todo o caminho. Converta para decimal
só na chamada ao gateway, com `centavosParaReais()`.

**3. O corpo do webhook é lido uma única vez, cru.**
```ts
const corpoCru = await request.text();      // uma vez só
verificarAssinatura(corpoCru, cabecalhos);  // sempre contra a string crua
const evento = JSON.parse(corpoCru);
```
Verificar contra JSON re-serializado quebra a assinatura. Reler o body lança
"Body has already been used".

**4. Assinatura é o primeiro portão, não a defesa.**
Depois de validar a assinatura, **reconsulte a cobrança na API do gateway** e
confira status e valor antes de marcar o pedido como pago.

**5. Idempotência é obrigatória.**
Grave `(provider, eventoId)` em `webhook_eventos` (índice UNIQUE) **antes** de
creditar. O Mercado Pago reenvia webhooks; sem isso o mesmo pedido é pago duas
vezes e o dono entrega o item em dobro.

**6. Responda 200 rápido**; o trabalho posterior vai em `ctx.waitUntil()`.

**7. Conferir o valor.** Se o valor pago divergir do `total_centavos` do pedido,
ou se o gateway não informar o valor, não marque como pago: mande para
`em_revisao` com uma nota. Valor desconhecido não é o mesmo que valor conferido.

**8. Nunca expirar um pedido sem perguntar ao gateway.** Expirar às cegas
transforma uma instabilidade do gateway em cliente que pagou e ficou sem o item.
Só é seguro expirar sem consulta um pedido que não chegou a ter cobrança.

**9. Um pagamento que chega atrasado não pode sumir.** Pix confirmado depois de
o pedido expirar vai para `em_revisao`, porque o dinheiro entrou de verdade.

**10. Distinguir "evento repetido" de "o banco falhou".** Só a violação de
UNIQUE é duplicata; qualquer outro erro devolve 500 para o gateway reenviar.
O texto do erro vem no `cause` do `DrizzleQueryError`, não no `message`.

## Assinatura do Mercado Pago

Cabeçalho `x-signature: ts=<epoch>,v1=<hex>`. Manifesto:

```
id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;
```

Partes ausentes são omitidas (incluindo o `;`). HMAC-SHA256 com o **segredo do
webhook do painel** — que não é o access token — e comparação em tempo constante.

## Máquina de estados

```
aguardando_pagamento ──(webhook pago)──> pago ──(admin entrega)──> entregue
        │       │                          │                          │
        │       └──(valor divergente ou    └──(admin)──> reembolsado <─┘
        │           desconhecido)──┐
        │(cron: gateway diz que    │
        │  não foi pago)           ▼
        └──────────> expirado ──> em_revisao ──(admin)──> pago | cancelado
                        (Pix caiu depois de expirar)
```

Transições válidas apenas nessa direção, e a tabela `TRANSICOES` em
`lib/pedidos.ts` é a fonte da verdade. Um pedido `entregue` nunca volta para
`pago`; de `em_revisao` nunca se vai direto para `entregue` — a revisão existe
justamente para alguém conferir antes.

**Toda mudança de status usa a guarda de status no `WHERE` e confere quantas
linhas foram afetadas.** Sem isso, dois administradores clicando "Entreguei" ao
mesmo tempo recebem sucesso os dois e entregam o item em dobro.

## Interface do provider

`src/worker/payments/provider.ts` define:

- `criarCobrancaPix(pedido)` → `{ chargeId, copiaCola, qrBase64, expiraEm }`
- `consultarCobranca(chargeId)` → status normalizado
- `verificarAssinaturaWebhook(corpoCru, cabecalhos)` → `boolean`
- `extrairEvento(corpoCru, cabecalhos)` → `{ eventoId, chargeId, tipo }`

Implementações: `mercadopago.ts` (produção) e `mock.ts` (desenvolvimento).

## Testar sem sandbox

O Mercado Pago **não permite pagar Pix de verdade em sandbox**. Por isso existe
o `MockProvider`: gera QR falso e expõe "simular pagamento", que dispara o mesmo
caminho interno do webhook real. Todo o fluxo é testável localmente. O teste
final em produção é uma compra real de R$ 0,01.

## Rede de segurança

Cron a cada 5 minutos (`scheduled` em `src/worker/index.ts`): reconsulta pedidos
`aguardando_pagamento` no gateway e expira **só** os que ele confirmou como não
pagos. Um webhook perdido sem essa reconciliação vira um cliente que pagou e
ficou sem o item.

Três detalhes que parecem miudezas e não são:

- **Ordena por vencimento**, não por criação: quem está mais perto de vencer é
  quem precisa de decisão agora, e resolvê-lo libera a vaga da rodada.
- **Poucos pedidos por rodada** (20). O Workers limita subrequisições por
  invocação; pedir mais faz o lote inteiro falhar no meio, rodada após rodada.
- **O provedor vem do pedido**, não da configuração atual. Ao trocar `mock` por
  `mercadopago` no deploy, as cobranças antigas continuam existindo só no
  provedor antigo.

Há ainda um freio de abuso independente do Turnstile: um mesmo IP só pode ter
alguns pedidos em aberto por vez. Sem ele, um script encheria a fila de
pendentes e afogaria justamente esta reconciliação.
