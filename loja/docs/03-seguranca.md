# Segurança da loja

Este documento explica, em português claro, **o que protege o seu dinheiro e os
dados dos seus jogadores**. A primeira parte é para você, dono do servidor. A
última é o anexo técnico, para quem for mexer no código.

Resumindo em uma frase: **nada que envolve dinheiro depende do que o navegador do
comprador diz**, e todo pagamento estranho para e chama uma pessoa em vez de
resolver sozinho.

---

## O que está em jogo

| O que pode ser atacado | O prejuízo |
|---|---|
| **O preço** | Alguém comprar um VIP de R$ 149,90 por R$ 0,01 |
| **A confirmação de pagamento** | Alguém convencer a loja de que pagou sem ter pago |
| **O painel** | Um estranho entrar e mexer em preços, pedidos e textos |
| **Os dados dos jogadores** | Vazar e-mails de quem comprou |
| **A loja em si** | Robôs criando milhares de cobranças falsas |
| **A sua reputação** | O jogador pagar e não receber, e contar isso no Discord |

---

## As 12 proteções, uma a uma

### 1. O preço nunca vem do navegador

**O ataque:** qualquer pessoa consegue abrir as ferramentas do navegador e mudar
o que a página envia. É o furo número um de loja feita às pressas.

**O que a loja faz:** o botão "Gerar Pix" manda **só qual produto e quantos** —
nenhum valor. O servidor lê o preço no banco de dados e calcula o total ali. Um
preço enviado pelo navegador é simplesmente ignorado.

### 2. O aviso de pagamento é conferido duas vezes

**O ataque:** alguém descobre o endereço do webhook e manda um aviso falso
dizendo "pedido tal foi pago".

**O que a loja faz:** confere a **assinatura digital** do aviso (que só quem tem
a assinatura secreta consegue produzir) e, mesmo assim, **pergunta de volta ao
Mercado Pago** se aquela cobrança está realmente paga. Um aviso forjado não passa
pela primeira porta; e se passasse, morreria na segunda.

### 3. O mesmo pagamento nunca é contado duas vezes

**O ataque:** reenviar o mesmo aviso de pagamento várias vezes para receber o
item várias vezes.

**O que a loja faz:** cada aviso tem um número, e esse número é guardado antes de
qualquer coisa ser creditada. Repetido, é descartado. Isso não é raro nem
malicioso, aliás: o Mercado Pago **reenvia avisos de propósito**, e sem essa
proteção um pedido seria creditado duas vezes sozinho.

### 4. Valor errado não vira entrega — vira revisão

**O ataque:** pagar R$ 1,00 num pedido de R$ 49,90 e receber assim mesmo.

**O que a loja faz:** o valor pago tem que bater **exatamente** com o total. Não
batendo, o pedido vai para a aba **Em revisão** com uma anotação, e você decide.
O sistema nunca entrega sozinho no escuro — e também **nunca faz o dinheiro
sumir**: mesmo um Pix que chega depois de o pedido expirar, ser cancelado ou
estornado é registrado para a sua decisão.

### 5. Ninguém entra no painel sem senha

**O ataque:** acessar `/admin` direto e mexer na loja.

**O que a loja faz:** **toda** operação do painel é verificada no servidor, não
só na tela. Esconder um botão não protege nada; aqui, quem chamar um endereço do
painel sem uma sessão válida recebe "não autorizado" — inclusive num endereço que
não existe, para não dar pistas de como o painel é organizado.

### 6. A senha do painel não é guardada

**O ataque:** alguém obter o banco de dados e sair com a sua senha.

**O que a loja faz:** guarda um resultado matemático embaralhado, gerado com
100.000 rodadas de cálculo, que **não pode ser revertido**. Nem o sistema sabe
qual é a sua senha; ele só sabe conferir se a que foi digitada bate.

### 7. Tentativa de adivinhar a senha é bloqueada — sem trancar você

**O ataque:** um robô testando milhares de senhas.

**O que a loja faz:** depois de 5 erros, aquele computador fica 15 minutos sem
poder tentar; e há um limite maior por endereço de internet.

O detalhe importante: o bloqueio é **por computador**, não pelo seu e-mail. Se
fosse pelo e-mail, qualquer estranho erraria a senha 6 vezes de propósito e
**trancaria você fora do seu próprio painel** — e, sem painel, os pedidos pagos
não são entregues. Quando o mesmo e-mail passa a ser atacado de muitos lugares ao
mesmo tempo, a loja fica mais lenta para responder a todo mundo, o que inviabiliza
o robô, mas **nunca recusa** a sua tentativa vinda de casa.

### 8. Descobrir se um e-mail é o do dono não é possível

**O ataque:** testar e-mails e ver qual demora mais para responder — a diferença
entrega qual deles existe.

**O que a loja faz:** faz exatamente o **mesmo trabalho** para um e-mail que
existe e para um que não existe, e devolve a mesma mensagem. Não dá para
diferenciar nem pelo texto, nem pelo tempo.

### 9. Um site falso não consegue agir em seu nome

**O ataque:** o clássico golpe em que você, logado no painel, abre outro site que
manda comandos escondidos para a sua loja aproveitando o seu login.

**O que a loja faz:** toda operação que muda alguma coisa confere **de onde o
pedido veio** e recusa o que não vem da própria loja. O login em si fica em um
cookie que o JavaScript de página nenhuma consegue ler.

### 10. Uma imagem enviada não pode virar um programa

**O ataque:** subir um arquivo que se apresenta como imagem mas é uma página com
código, e fazer a loja servi-lo — passando a rodar código malicioso dentro do
seu próprio endereço.

**O que a loja faz:** confere o **conteúdo real** do arquivo (os primeiros bytes,
que denunciam o formato de verdade), não o nome nem o rótulo que veio junto. E,
ao servir a imagem depois, é a loja que decide o tipo dela — nunca o que estava
guardado.

### 11. Texto de jogador é sempre texto

**O ataque:** um jogador colocar código no nick ou no e-mail, para que ele seja
executado quando você abrir o painel.

**O que a loja faz:** todo texto vindo de fora é exibido como texto, sempre. Isso
vale para o banco de dados também: as consultas usam parâmetros separados, então
um nick como `' OR 1=1--` é gravado literalmente assim, como um nome esquisito, e
não vira comando de banco de dados.

### 12. O jogador não enxerga o pedido dos outros

**O ataque:** trocar o número do pedido na barra de endereço e ler os dados
alheios.

**O que a loja faz:** o código do pedido é um número aleatório grande demais para
ser adivinhado, e a página pública mostra só o necessário — **sem e-mail, sem
dados internos**. O painel, além disso, pede que as respostas com dados de
clientes **não sejam guardadas em cache** por navegador nenhum.

---

## Como sabemos que continua funcionando

O sistema tem **204 testes automáticos**, dos quais **47 são ataques de verdade**
contra a própria loja: preço forjado, aviso de pagamento falsificado, sessão
adulterada, arquivo disfarçado de imagem, texto malicioso no nick, tentativa de
ler o pedido dos outros.

Cada um desses testes verifica **duas** coisas: que o ataque foi recusado **e**
que ele não deixou rastro — porque uma recusa que acontece depois do estrago já é
tarde demais.

Eles rodam com um comando:

```bash
npm test
```

Se algum dia alguém mexer no código e derrubar uma dessas proteções sem perceber,
o teste falha e a alteração não deve ser publicada.

---

## O que depende de você

A parte técnica está feita. Estas quatro coisas estão nas suas mãos:

1. **Use uma senha longa no painel** — 16 caracteres ou mais, que você não use em
   nenhum outro lugar. Toda a proteção do item 6 e do item 7 gira em torno disso.
2. **Ligue a verificação em duas etapas** nas contas da Cloudflare e do Mercado
   Pago. São elas que controlam o site e o dinheiro.
3. **Nunca compartilhe o login do painel.** Se um moderador precisar acessar,
   crie um usuário separado para ele.
4. **Deixe o Turnstile ligado** (Passo 4 da
   [implantação](02-implantacao-cloudflare.md)). Sem ele, a porta de criar
   cobranças fica aberta para robôs.

E uma regra que vale para sempre: **os segredos nunca entram no código**. Eles
ficam no cofre da Cloudflare, cadastrados por `wrangler secret put`.

---

## O que este sistema não faz

Ser honesto sobre os limites também é parte da segurança:

- **Não é antifraude bancário.** Se um Pix for pago e depois contestado no banco,
  isso se resolve entre você e o Mercado Pago.
- **Não impede alguém de comprar para o nick errado.** A loja mostra o skin
  justamente para reduzir isso, mas quem digita é o comprador.
- **Não entrega no jogo sozinha.** A entrega é manual, por decisão de projeto.
  Enquanto for assim, o item só chega quando você clicar em "Entreguei".
- **Não protege contra a sua própria senha vazada.** Se ela sair de casa, quem a
  tiver entra no painel. Daí os itens 1 e 3 da lista acima.

---

# Anexo técnico

Para quem for trabalhar no código. As regras completas estão em
`.claude/skills/security/SKILL.md`; a suíte de ataques é
`src/worker/security.test.ts`.

## Mecanismos e onde eles vivem

| Proteção | Implementação |
|---|---|
| Preço calculado no servidor | `src/worker/lib/orders.ts` — `createOrder` relê o produto no D1 |
| Assinatura do webhook | `src/worker/payments/mercadopago.ts` — HMAC-SHA256, comparação em tempo constante |
| Reconsulta da cobrança | `src/worker/routes/webhook.ts` → `provider.getCharge()` antes de creditar |
| Idempotência | Tabela `webhook_events`, com restrição UNIQUE, gravada antes do crédito |
| Crédito exato + corrida | `UPDATE ... WHERE status = 'awaiting_payment'` — só um lado da corrida vence |
| Pagamento em pedido fechado | `CLOSED_BUT_PAYABLE` em `lib/orders.ts` — expirado, cancelado ou estornado vai para `needs_review` |
| Guarda do painel | `src/worker/index.ts` — um único `app.use("/api/admin/*")`, com `login`/`logout` como exceção declarada |
| Sessão | Cookie HMAC + KV para revogação; prefixo `__Host-` em produção, `Secure`, `HttpOnly`, `SameSite=Strict` |
| Senha | PBKDF2-SHA256, 100.000 rodadas, com piso mínimo de rodadas na verificação |
| Enumeração de e-mail | `verifyAgainstMissingUser` — mesmo custo de CPU nos dois caminhos |
| Limite de tentativas | `src/worker/lib/rate-limit.ts` — janelas em KV por conta+IP, por IP e por e-mail |
| CSRF | `requireSameOrigin` em todo `/api/*`, exceto o webhook (que se autentica por HMAC) |
| Cabeçalhos da API | `apiSecurityHeaders` em `src/worker/lib/security.ts` |
| Cabeçalhos das páginas | `public/_headers` — CSP, HSTS, `frame-ancestors 'none'`, `noindex` no `/admin/*` |
| Tipo de imagem | `src/worker/lib/images.ts` — detecção por magic bytes; o tipo servido vem da chave |
| URLs em configurações | `isSafeUrl` em `routes/admin/catalog.ts` — resolve a URL em vez de olhar o prefixo |
| Injeção de SQL | Drizzle com parâmetros ligados; nenhum `prepare()` cru no Worker |
| Anti-robô | `src/worker/lib/turnstile.ts` — falha fechada quando configurado |
| Origem confiável | `PUBLIC_BASE_URL` em vez do cabeçalho `Host` recebido |

## Modelo de ameaça

Quatro perfis, do mais provável ao mais raro:

1. **O comprador curioso** — mexe no navegador, tenta preço menor, tenta ver
   pedido alheio. É contra ele que quase tudo aqui foi escrito.
2. **O robô** — cria cobranças em massa, testa senhas. Turnstile, limite por IP e
   limite de pedidos em aberto por IP.
3. **A sessão de admin comprometida** — alguém com o login do painel. Reduz-se o
   estrago: URLs validadas, upload restrito, chaves de imagem com formato fixo.
4. **O gateway** — tratado como uma fonte externa não confiável: assinatura,
   reconsulta e idempotência em toda entrada.

## Ao adicionar uma funcionalidade

- Rota nova no painel: acrescente-a à lista `PROTECTED` em
  `src/worker/routes/admin/admin.test.ts`.
- Qualquer coisa que envolva dinheiro: um teste provando que o valor enviado pelo
  cliente é ignorado.
- Auth, upload, webhook ou cabeçalho: um teste de ataque em
  `src/worker/security.test.ts`.
- Antes de publicar: `npm test` e o agente `security-auditor`.
