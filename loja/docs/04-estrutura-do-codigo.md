# Estrutura do código

Este documento explica **como o sistema é organizado por dentro**. Serve para
você entender o que existe, e para qualquer programador que venha a mexer na loja
descobrir onde as coisas ficam sem precisar ler tudo.

Não é preciso saber programar para ler a primeira metade.

---

## A ideia central: um programa só

Quase toda loja online é feita de duas partes separadas — o site que aparece e um
servidor por trás. Aqui as duas moram no **mesmo lugar**, um único programa
publicado na Cloudflare (um *Worker*).

```
                      ┌──────────────────────────────────┐
   Jogador  ────────► │        Cloudflare Worker         │
   (navegador)        │                                  │
                      │  /            → páginas (React)  │
                      │  /api/...     → a API (Hono)     │
                      └───────┬───────────┬──────────────┘
                              │           │
                   ┌──────────┴──┐   ┌────┴──────────┐
                   │ D1  (banco) │   │ R2 (imagens)  │
                   │ KV (sessão) │   │ Mercado Pago  │
                   └─────────────┘   └───────────────┘
```

Por que isso importa na prática:

- **Um deploy só.** `npm run deploy` publica tudo junto.
- **Sem problema de domínios cruzados.** A página e a API têm o mesmo endereço.
- **Cabe no plano gratuito** da Cloudflare com folga.

---

## O caminho de uma compra

O trajeto completo, do clique ao item entregue:

```
1. Jogador escolhe o produto            → página do produto
2. Confirma nick, plataforma e e-mail   → checkout
3. Clica em "Gerar Pix"
        │
        ▼
4. O servidor RECALCULA o preço pelo banco de dados
5. Pede a cobrança ao Mercado Pago      → recebe QR Code + copia e cola
6. Grava o pedido como "aguardando pagamento"
        │
        ▼
7. Jogador paga pelo app do banco
8. Mercado Pago avisa a loja            → /api/webhook/pix
9. A loja confere a assinatura e pergunta de volta se está pago mesmo
10. Pedido vira "pago" e entra na fila do painel
        │
        ▼
11. Você entrega no jogo e clica "Entreguei"
12. Pedido vira "entregue" — o jogador vê isso no link dele
```

Em paralelo, **a cada 5 minutos**, um robô interno (*cron*) revisa os pedidos
pendentes: pergunta ao Mercado Pago se algum foi pago sem que o aviso chegasse, e
encerra os que passaram do prazo. É a rede de segurança do passo 8.

---

## Os estados de um pedido

Um pedido só anda pelos caminhos desenhados abaixo. Isso é uma tabela dentro do
código, não uma sequência de "se" espalhada — assim é impossível, por
construção, entregar duas vezes ou um pedido expirado "voltar" a pago.

```
   aguardando_pagamento ──(Pix confirmado)──► pago ──(você entrega)──► entregue
        │      │                               │                          │
        │      │(cron: prazo esgotou)          └──(você estorna)──► estornado
        │      ▼                                                          │
        │   expirado ─────────┐                                           │
        │                     │                                           │
        └──(você cancela)──► cancelado ──┤ dinheiro chegou depois │◄───────┘
                                         └──────────┬─────────────┘
                                                    ▼
                                              em_revisão
                                     (nunca entrega sozinho: chama você)
```

**em_revisão** é o estado mais importante para a sua tranquilidade: é onde o
sistema coloca todo pagamento que não fecha com a expectativa — valor diferente,
valor desconhecido, ou Pix que chegou depois de o pedido fechar. Nada é entregue
e nada é ignorado.

---

## As pastas

```
loja/
├── migrations/            Histórico do banco de dados (SQL versionado)
├── public/                Arquivos servidos como estão
│   ├── _headers           Regras de segurança das páginas
│   └── robots.txt         O que os buscadores não devem indexar
├── docs/                  Esta documentação
├── scripts/               Utilitários (criar administrador)
├── seed.sql               Dados de exemplo para desenvolvimento
├── wrangler.jsonc         Configuração do deploy (SEM segredos)
└── src/
    ├── worker/            O servidor
    │   ├── index.ts         Porta de entrada: middlewares e rotas
    │   ├── routes/          Os endereços da API
    │   │   ├── catalog.ts     produtos, categorias, configurações
    │   │   ├── checkout.ts    criação do pedido e da cobrança
    │   │   ├── orders.ts      consulta pública de um pedido
    │   │   ├── webhook.ts     recebe o aviso do Mercado Pago
    │   │   └── admin/         o painel (protegido)
    │   ├── payments/        Integração com o gateway
    │   │   ├── provider.ts     o contrato
    │   │   ├── mercadopago.ts  a implementação de verdade
    │   │   └── mock.ts         a simulada, para desenvolvimento
    │   ├── lib/             Regras de negócio e utilidades
    │   │   ├── orders.ts       estados, criação, reconciliação
    │   │   ├── auth.ts         senha e sessão
    │   │   ├── security.ts     cabeçalhos, origem, cache
    │   │   ├── rate-limit.ts   limite de tentativas
    │   │   └── images.ts       formatos aceitos de imagem
    │   └── db/schema.ts     A definição das tabelas
    ├── shared/            O que os dois lados usam (tipos, dinheiro)
    ├── app/               O site em React
    │   ├── routes/          Home, Loja, Produto, Checkout, Pedido, Legal
    │   ├── admin/           As telas do painel
    │   ├── components/      Peças reaproveitadas (botão, card, avatar)
    │   └── styles/theme.css O design: cores, fontes, espaçamentos
    └── test/              Apoio dos testes automáticos
```

---

## O banco de dados

Sete tabelas, no D1 (que é um SQLite gerenciado pela Cloudflare):

| Tabela | Guarda |
|---|---|
| `categories` | VIP, Cash, Kits, Chaves — nome, ordem, se está ativa |
| `products` | Nome, preço, duração, estoque, descrição, imagem, destaque |
| `orders` | O pedido: nick, plataforma, e-mail, total, status, dados do Pix |
| `order_items` | **Uma cópia congelada** do que foi comprado, com o preço da época |
| `webhook_events` | Todo aviso já recebido do gateway — é o que impede crédito em dobro |
| `admin_users` | Quem entra no painel, com a senha embaralhada |
| `settings` | Os textos e dados que você edita no painel |

Duas decisões que valem ser conhecidas:

**Dinheiro é sempre número inteiro, em centavos.** `R$ 29,90` é guardado como
`2990`. Nunca com vírgula. Arredondamento de centavo é a causa clássica de a
loja e o extrato do banco não baterem no fim do mês.

**A tabela `order_items` é uma fotografia.** Ela copia o nome e o preço do
produto no momento da compra. Se você aumentar o preço do VIP amanhã, os pedidos
de ontem continuam mostrando o valor de ontem — o histórico de vendas não pode
ser reescrito.

Mudanças no banco ficam em `migrations/`, versionadas. Não se edita o banco à
mão: gera-se uma migração a partir do `schema.ts`.

---

## A camada de pagamento

O gateway fica atrás de um **contrato** (`payments/provider.ts`) com quatro
operações: criar cobrança Pix, consultar cobrança, conferir assinatura do aviso e
interpretar o aviso.

Existem duas implementações:

- **`mercadopago.ts`** — a de produção.
- **`mock.ts`** — a simulada, usada em desenvolvimento. Ela existe por um motivo
  concreto: **o ambiente de testes do Mercado Pago não consegue pagar um Pix de
  verdade**. Sem a versão simulada, seria impossível exercitar o fluxo inteiro —
  QR, espera, confirmação, fila de entrega — antes de ir para o ar.

Trocar de gateway um dia custa **um arquivo novo**, não uma reforma.

---

## O site (React)

- Todo acesso à API passa por um único arquivo, `src/app/lib/api.ts`. Nenhum
  componente chama a rede sozinho — assim tratamento de erro e formato de
  resposta ficam num lugar só.
- O visual é definido por *tokens* em `src/app/styles/theme.css`: cores,
  espaçamentos, cantos, sombras. Mudar o tom de verde da loja é mudar um valor
  ali, não caçar a cor em trinta arquivos.
- O painel (`src/app/admin/`) tem cabeçalho e navegação próprios, sem nada da
  loja.

> A verificação de quem pode ver o painel **também acontece no servidor**.
> Esconder uma tela no navegador não protege coisa alguma.

---

## Os testes

204 testes automáticos, rodando **dentro do mesmo motor da Cloudflare** que
executa o sistema em produção, com banco e armazenamento de verdade e as mesmas
migrações.

Isso é de propósito. Testar só a lógica pura não pega uma consulta quebrada, uma
migração faltando ou uma proteção que deixou de guardar uma rota — que é
exatamente o que costuma quebrar quando alguém adiciona uma funcionalidade.

| Arquivo | Cobre |
|---|---|
| `shared/money.test.ts` | Contas em centavos e formato em reais |
| `worker/lib/order-state.test.ts` | Cada transição possível do pedido |
| `worker/lib/auth.test.ts` | Senha e sessão |
| `worker/payments/mercadopago.test.ts` | Assinatura, janela de repetição, eventos |
| `worker/routes/*.test.ts` | Catálogo, checkout, webhook, pedidos, painel |
| `worker/scheduled.test.ts` | O robô de 5 em 5 minutos |
| `worker/security.test.ts` | **A suíte de ataques** (47 testes) |

```bash
npm test           # tudo
npm run typecheck  # confere os tipos
```

---

## Convenções que não se quebram

1. **Dinheiro em centavos**, inteiro, em todas as camadas.
2. **O preço nunca vem do cliente** — o servidor recalcula sempre.
3. **Segredos nunca no repositório** — `.dev.vars` local (fora do Git) e
   `wrangler secret put` em produção.
4. **Histórico de vendas é imutável.**
5. **Toda rota do painel é protegida no servidor**, e a lista delas está fixada
   em um teste.
6. **Toda requisição que muda algo confere a origem.**
7. **Código em inglês, conteúdo em português.** Nomes de variáveis, comentários,
   tabelas e testes em inglês; tudo o que o usuário lê — textos das telas,
   mensagens de erro, nomes de produto — em português.

O detalhamento de cada uma está em `CLAUDE.md` e em `.claude/skills/`.

---

## Onde mexer para cada coisa

| Quero mudar | Vá em |
|---|---|
| Cor, fonte, espaçamento | `src/app/styles/theme.css` |
| Um texto de uma tela | O arquivo da tela em `src/app/routes/` |
| Uma regra de preço ou estoque | `src/worker/lib/orders.ts` |
| Um campo novo no produto | `src/worker/db/schema.ts` → gerar migração → formulário do painel |
| A integração de pagamento | `src/worker/payments/` |
| Uma proteção de segurança | `src/worker/lib/security.ts` e o teste correspondente |
| O que aparece na home | `src/app/routes/Home.tsx` |

E, sempre, antes de publicar: `npm test`.
