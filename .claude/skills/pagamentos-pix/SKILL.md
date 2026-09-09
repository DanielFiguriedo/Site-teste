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
não marque como pago — registre e deixe para revisão manual no admin.

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
        │                                  │
        │(cron: expirou)                   └──(admin)──> reembolsado
        └──────────> expirado
                                           cancelado (admin, a qualquer momento)
```

Transições válidas apenas nessa direção. Um pedido `entregue` nunca volta para
`pago`. Toda mudança feita pelo admin registra quem fez (`entregue_por`).

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
`aguardando_pagamento` no gateway e expira os vencidos. Um webhook perdido sem
essa reconciliação vira um cliente que pagou e ficou sem o item.
