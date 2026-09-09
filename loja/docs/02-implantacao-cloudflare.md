# Como colocar a loja no ar

Guia passo a passo para publicar a loja na Cloudflare e ligar o pagamento por
Pix do Mercado Pago. Foi escrito para quem **não é programador**: cada comando
está pronto para copiar e colar, e cada passo explica o que vai acontecer.

Reserve umas **duas horas** na primeira vez. A parte demorada não é a técnica —
é esperar a aprovação da conta do Mercado Pago.

---

## Antes de começar: entendendo as peças

Três empresas diferentes participam disso. Vale entender o papel de cada uma:

| Peça | O que faz | Custo |
|---|---|---|
| **Cloudflare** | Hospeda o site e o banco de dados | Grátis, no plano gratuito |
| **Mercado Pago** | Gera o Pix e avisa a loja quando o dinheiro cai | 0,99% por venda (confira na sua conta) |
| **Domínio** (opcional) | O endereço bonito, `loja.seuservidor.com.br` | ~R$ 40/ano, se você quiser um |

Sem domínio próprio, a loja já sobe em um endereço grátis que a Cloudflare dá,
tipo `loja-minecraft.SEU-USUARIO.workers.dev`. Dá para vender assim e comprar o
domínio depois — trocar o endereço não quebra nada.

### O que você precisa ter em mãos

- [ ] Um computador com Windows, Mac ou Linux
- [ ] Um e-mail para criar a conta da Cloudflare
- [ ] **CPF** e uma conta bancária com **chave Pix** para o Mercado Pago
- [ ] O **IP do seu servidor** de Minecraft
- [ ] O link de convite do seu **Discord** (opcional)
- [ ] Imagens dos produtos (opcional — a loja funciona sem elas)

---

## Passo 0 — Preparar o computador

Isso é feito **uma vez só**.

### 0.1 Instalar o Node.js

Baixe em <https://nodejs.org> a versão **LTS** e instale clicando "avançar" até o
fim. Ele é o programa que roda as ferramentas do projeto.

### 0.2 Abrir o terminal

- **Windows:** menu Iniciar → digite `PowerShell` → abra
- **Mac:** Spotlight (⌘ + espaço) → digite `Terminal` → abra

O terminal é aquela tela preta onde se digitam comandos. Cada comando abaixo é
uma linha: cole e aperte Enter.

### 0.3 Entrar na pasta do projeto e instalar

```bash
cd caminho/para/Site-teste/loja
npm install
```

O `npm install` baixa as bibliotecas do projeto. Demora alguns minutos na
primeira vez e enche a tela de texto — é normal.

---

## Passo 1 — Criar a conta da Cloudflare

1. Acesse <https://dash.cloudflare.com/sign-up> e crie a conta com e-mail e senha.
2. Confirme o e-mail que eles enviam.
3. **Ative a verificação em duas etapas** (2FA) em *My Profile → Authentication*.
   Essa conta vai controlar a sua loja inteira; proteja-a como você protege a
   conta do banco.

Não é preciso escolher plano nenhum: o gratuito cobre tudo o que a loja usa.

Agora conecte o seu computador à conta:

```bash
npx wrangler login
```

Abre o navegador pedindo autorização. Clique em **Allow** e volte ao terminal.

> `wrangler` é o programa oficial da Cloudflare para publicar o site. O `npx`
> baixa e roda ele na hora; você não precisa instalar nada à parte.

---

## Passo 2 — Criar os três guardas-volumes na Cloudflare

A loja precisa de três lugares para guardar coisas:

| Nome | Guarda o quê |
|---|---|
| **D1** (banco de dados) | Produtos, pedidos, configurações |
| **R2** (arquivos) | As imagens dos produtos |
| **KV** (chave-valor) | As sessões de login do painel |

Crie os três:

```bash
npx wrangler d1 create loja-minecraft
npx wrangler r2 bucket create loja-minecraft-images
npx wrangler kv namespace create SESSIONS
```

Cada comando imprime um **identificador** (`database_id`, `id`) — uma sequência
grande de letras e números.

Abra o arquivo `wrangler.jsonc` (na pasta `loja`, com o Bloco de Notas mesmo) e
cole cada identificador no lugar onde está escrito `FILL_IN_...`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "loja-minecraft",
    "database_id": "cole-aqui-o-id-que-o-comando-imprimiu",
    "migrations_dir": "./migrations"
  }
],
"kv_namespaces": [{ "binding": "SESSIONS", "id": "cole-aqui-o-outro-id" }]
```

> Esse arquivo **não guarda senha nenhuma**. Esses identificadores não são
> segredo — são só endereços. As senhas de verdade entram no Passo 5, por outro
> caminho.

### Criar as tabelas do banco

```bash
npm run db:migrate:remote
```

Isso cria, no banco lá na Cloudflare, as tabelas de produtos, pedidos e
configurações. Ele responde listando as migrações aplicadas.

---

## Passo 3 — Conta do Mercado Pago e a integração do Pix

Essa é a parte que faz o dinheiro entrar. Leia com calma.

### 3.1 Por que Mercado Pago

Com ticket médio de R$ 5 a R$ 30, o que importa é a **taxa percentual**: 0,99%
sobre um item de R$ 10 dá **10 centavos**. Concorrentes que cobram taxa fixa
levariam R$ 0,50 ou até R$ 1,99 na mesma venda. Além disso, o cadastro é feito só
com CPF e a integração funciona bem dentro da Cloudflare.

### 3.2 Criar a conta e cadastrar a chave Pix

1. Crie a conta em <https://www.mercadopago.com.br> com o seu CPF.
2. Complete a validação de identidade que eles pedem (documento e selfie). **É
   aqui que costuma demorar** — pode levar de minutos a alguns dias.
3. Cadastre a sua **chave Pix** na conta Mercado Pago, para conseguir sacar o
   dinheiro que entrar.

> **Dois avisos que evitam susto:**
>
> - Em conta nova, sem histórico, o Mercado Pago às vezes segura o dinheiro por
>   alguns dias em vez de liberar na hora. Confira em *Seu dinheiro → Prazos de
>   liberação* e programe-se: a loja funciona igual, mas o saque pode demorar.
> - A taxa exata é por conta. Confira na página de **Custos** da sua conta antes
>   de definir os preços dos produtos.

### 3.3 Pegar o Access Token de **produção**

O Access Token é a senha que autoriza a loja a criar cobranças Pix em seu nome.

1. Vá ao painel do desenvolvedor: <https://www.mercadopago.com.br/developers>
2. **Suas integrações** → crie uma aplicação (nome qualquer, ex.: "Loja do
   servidor").
3. Dentro dela, abra **Credenciais de produção**.
4. Copie o **Access Token**.

> **Atenção ao par teste/produção.** Existem credenciais *de teste* e *de
> produção*, e elas se parecem. As de produção começam com `APP_USR-`. Se você
> usar as de teste, a loja gera QR Codes que **não recebem dinheiro de verdade**.

Guarde esse valor num lugar seguro por enquanto — ele entra no Passo 5.

### 3.4 Criar o webhook e pegar a assinatura secreta

**Webhook** é o telefonema que o Mercado Pago dá para a sua loja dizendo "o Pix
do fulano caiu". É o que faz a tela do comprador mudar sozinha.

Ainda em **Suas integrações → a sua aplicação → Webhooks** (ou "Notificações"):

1. Informe a URL que a sua loja vai atender:

   ```
   https://SEU-ENDERECO/api/webhook/pix
   ```

   Se você ainda não sabe o endereço final, **pule esta parte e volte depois do
   Passo 7** — é lá que a Cloudflare imprime o endereço definitivo.

2. Marque o evento de **Pagamentos** (`payment`).
3. Salve. O painel vai gerar uma **assinatura secreta** (*secret key*). Copie.

> **O erro nº 1 dessa etapa:** confundir a *assinatura secreta do webhook* com o
> *Access Token*. São duas coisas diferentes, guardadas em lugares diferentes. Se
> você trocar uma pela outra, a loja vai **recusar todos os avisos de pagamento**
> — o dinheiro entra na sua conta do Mercado Pago, mas o pedido fica preso em
> "aguardando pagamento". Confira duas vezes.

### 3.5 O que a loja faz com isso (para você saber o que esperar)

Quando um jogador clica em "Gerar Pix":

1. A loja **recalcula o preço** pelo banco de dados e pede ao Mercado Pago uma
   cobrança Pix com validade de 30 minutos.
2. O Mercado Pago devolve o QR Code e o código copia e cola, que aparecem na tela.
3. O jogador paga pelo app do banco.
4. O Mercado Pago chama o webhook da loja.
5. A loja **confere a assinatura** do aviso, **pergunta de volta ao Mercado
   Pago** se aquela cobrança está realmente paga e só então marca o pedido como
   pago e coloca na sua fila de entrega.
6. Se o webhook se perder no caminho, um **robô interno roda a cada 5 minutos** e
   pergunta ao Mercado Pago o que houve com cada pedido pendente. É a rede de
   segurança: sem ela, um telefonema perdido viraria um cliente que pagou e ficou
   sem o item.

Você não precisa fazer nada disso à mão. Só precisa saber que existe — e que, se
o valor pago não bater com o pedido, ninguém entrega nada automaticamente: o
pedido vai para a aba **Em revisão** do painel, esperando a sua decisão.

---

## Passo 4 — Proteção contra robôs (Turnstile)

O Turnstile é o "não sou um robô" da Cloudflare, e é **grátis**. Sem ele, alguém
pode mandar a loja criar milhares de cobranças Pix falsas.

1. No painel da Cloudflare, procure **Turnstile** no menu lateral.
2. **Add site** → dê um nome → informe o domínio da loja (ou
   `SEU-USUARIO.workers.dev`).
3. Ele gera duas chaves: uma **Site Key** (pública) e uma **Secret Key**
   (secreta).
4. Cole a **Site Key** no arquivo `wrangler.jsonc`:

   ```jsonc
   "TURNSTILE_SITE_KEY": "cole-a-site-key-aqui"
   ```

A Secret Key entra no próximo passo.

> Deixar a Site Key vazia **desliga a proteção**. A loja continua funcionando —
> por isso é fácil esquecer. Preencha antes de divulgar o link.

---

## Passo 5 — Guardar os segredos

Agora as senhas de verdade. Elas **nunca** vão para dentro de um arquivo do
projeto: ficam num cofre da Cloudflare, e nem quem tiver o código consegue lê-las.

Rode um comando de cada vez. Cada um vai pedir o valor; cole e aperte Enter.

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put MERCADOPAGO_ACCESS_TOKEN
npx wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

| Segredo | O que colar |
|---|---|
| `SESSION_SECRET` | Uma sequência aleatória e longa, inventada por você (40+ caracteres, letras e números misturados). É o que assina o seu login no painel |
| `MERCADOPAGO_ACCESS_TOKEN` | O Access Token **de produção** do Passo 3.3 |
| `MERCADOPAGO_WEBHOOK_SECRET` | A **assinatura secreta** do Passo 3.4 |
| `TURNSTILE_SECRET_KEY` | A Secret Key do Passo 4 |

> Se o wrangler perguntar se deve criar o Worker que ainda não existe, responda
> que **sim**.

Precisa de uma sequência aleatória boa para o `SESSION_SECRET`? Rode:

```bash
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

E copie o resultado.

---

## Passo 6 — Informar o endereço da loja

Ainda no `wrangler.jsonc`, preencha:

```jsonc
"PUBLIC_BASE_URL": "https://SEU-ENDERECO"
```

Sem barra no final. Ex.: `https://loja-minecraft.fulano.workers.dev` ou
`https://loja.seuservidor.com.br`.

**Por que isso importa:** esse valor fixa o endereço que a loja informa ao
Mercado Pago para receber os avisos de pagamento, e o endereço que ela usa para
reconhecer os próprios formulários. Deixando vazio, ela passa a confiar no que
cada visitante *diz* que o endereço é — o que abre espaço para trapaça.

Se você ainda não sabe o endereço, publique primeiro (Passo 7), anote o endereço
que aparecer, volte aqui, preencha e publique de novo.

---

## Passo 7 — Publicar

```bash
npm run deploy
```

Isso monta o site e envia tudo para a Cloudflare. No fim, ele imprime o endereço
público, algo como:

```
https://loja-minecraft.SEU-USUARIO.workers.dev
```

**A loja está no ar.** Abra esse endereço no navegador.

> Se você pulou o Passo 3.4 ou o Passo 6, volte neles agora com o endereço em
> mãos, e rode `npm run deploy` de novo.

---

## Passo 8 — Criar o seu usuário do painel

O painel não tem tela de cadastro — de propósito: se tivesse, qualquer pessoa
poderia se cadastrar como dono da loja.

```bash
npm run admin:create -- voce@email.com "sua-senha-bem-forte"
```

Ele imprime um comando SQL. Copie a linha inteira e rode:

```bash
npx wrangler d1 execute loja-minecraft --remote --command "COLE-O-SQL-AQUI"
```

Agora acesse `https://SEU-ENDERECO/admin` e entre.

> A senha é embaralhada **no seu computador** antes de ir para o banco: ela nunca
> viaja pela internet como texto, e nem você consegue lê-la de volta depois.
> Use uma senha longa — esse painel controla as suas vendas.

---

## Passo 9 — Configurar a loja pelo painel

Antes de divulgar, entre em **Configurações** e preencha:

- Nome do servidor
- IP do servidor
- Prazo de entrega ("em até 24 horas")
- Aviso sobre a entrega
- **Termos de uso** e **Política de reembolso** (obrigatórios na prática, veja o
  [guia das telas](01-guia-das-telas.md#9-termos-de-uso-e-política-de-reembolso))

Depois vá em **Produtos** e cadastre o que você vende. Os produtos de exemplo,
se existirem, podem ser desativados ou apagados.

---

## Passo 10 — O teste final (com dinheiro de verdade)

**Este passo não é opcional.** O ambiente de testes do Mercado Pago **não
consegue pagar um Pix de verdade**, então a única forma de saber que tudo
funciona é uma compra real:

1. No painel, crie um produto de **R$ 0,01** chamado "Teste".
2. Abra a loja, compre esse produto e **pague o Pix pelo seu próprio banco**.
3. Confira, em ordem:
   - [ ] A tela do comprador mudou sozinha para "Pagamento confirmado"
   - [ ] O pedido apareceu na aba **A entregar** do painel
   - [ ] O 1 centavo apareceu na sua conta do Mercado Pago
4. Clique em **Entreguei** e confirme que o pedido saiu da fila.
5. **Desative o produto de teste.**

Se o pagamento caiu no Mercado Pago mas a tela não mudou, o problema é quase
sempre o webhook — veja a lista de problemas no fim deste documento.

---

## Passo 11 — Domínio próprio (opcional)

Para usar `loja.seuservidor.com.br` no lugar do endereço `.workers.dev`:

1. No painel da Cloudflare, adicione o seu domínio em **Websites → Add a site** e
   siga as instruções para apontar os servidores de nomes (isso é feito no site
   onde você comprou o domínio).
2. Depois, em **Workers & Pages → loja-minecraft → Settings → Domains & Routes**,
   adicione o domínio personalizado.
3. Atualize `PUBLIC_BASE_URL` no `wrangler.jsonc` para o novo endereço.
4. Atualize a URL do webhook no painel do Mercado Pago.
5. `npm run deploy`.

---

## Como atualizar a loja depois

Mudanças de **produto, preço, texto e configuração** são feitas no painel e valem
na hora. Não precisa de nada disso.

Já uma mudança **no código** (uma tela nova, um comportamento diferente) exige
publicar de novo:

```bash
npm test          # confere que nada quebrou
npm run deploy
```

Se `npm test` acusar erro, **não publique**. Os testes existem justamente para
segurar uma alteração que quebraria a loja no ar.

---

## Quando algo dá errado

| Sintoma | Causa mais provável | O que fazer |
|---|---|---|
| Paguei e a tela não mudou | Webhook não configurado, ou apontando para o endereço errado | Confira a URL no Mercado Pago: tem que terminar em `/api/webhook/pix` e ser exatamente o endereço da loja no ar |
| Nenhum pagamento é reconhecido | `MERCADOPAGO_WEBHOOK_SECRET` trocado com o Access Token | Refaça o Passo 5 com os valores certos |
| O QR Code aparece, mas o dinheiro nunca chega | Credenciais **de teste** no lugar das de produção | Pegue as credenciais de produção (Passo 3.3) e refaça o Passo 5 |
| Nem consigo abrir a loja | Publicação não terminou | Rode `npm run deploy` de novo e leia a mensagem final |
| O painel diz "Tentativas demais" | Você errou a senha 5 vezes | Espere 15 minutos. Isso vale só para o computador que errou |
| Não aparece o "não sou um robô" no checkout | `TURNSTILE_SITE_KEY` vazio | Passo 4 |
| Um pedido está "Em revisão" | Pagou valor diferente, ou pagou depois de o pedido fechar | Abra o pedido, leia a anotação e decida: entregar ou estornar pelo Mercado Pago |

Mais detalhes do dia a dia estão em
[Operação e manutenção](05-operacao-e-manutencao.md).

---

## Conferência final

- [ ] Loja abre no endereço público
- [ ] `PUBLIC_BASE_URL` preenchido com esse endereço
- [ ] Webhook do Mercado Pago apontando para `/api/webhook/pix`
- [ ] Os quatro segredos cadastrados
- [ ] Turnstile ligado (Site Key + Secret Key)
- [ ] Usuário do painel criado, com senha forte
- [ ] Nome, IP, prazo e avisos preenchidos
- [ ] Termos de uso e Política de reembolso escritos
- [ ] Compra real de R$ 0,01 feita, confirmada e entregue
- [ ] Produto de teste desativado
- [ ] Verificação em duas etapas ligada na conta da Cloudflare
