# Rodando a loja no seu computador

Como colocar a loja para funcionar **na sua própria máquina**, sem publicar nada
e sem gastar um centavo. Serve para experimentar antes de ir para o ar, para
testar uma mudança, ou só para conhecer o sistema com calma.

Tudo aqui roda **offline**: banco de dados local, imagens locais e um pagamento
Pix **simulado**, com um botão de "pagar" na tela. Nenhum dinheiro real, nenhuma
conta do Mercado Pago necessária.

---

## O que você precisa

- **Node.js 20 ou mais novo** — baixe a versão **LTS** em <https://nodejs.org> e
  instale clicando "avançar" até o fim.
- A pasta do projeto no seu computador.
- Um terminal:
  - **Windows:** menu Iniciar → digite `PowerShell` → abra
  - **Mac:** ⌘ + espaço → digite `Terminal` → abra

Para conferir se o Node está instalado:

```bash
node --version
```

Se aparecer algo como `v24.19.0`, está certo.

---

## Primeira vez: cinco comandos

Abra o terminal, entre na pasta `loja` do projeto e rode um comando de cada vez:

```bash
cd caminho/para/Site-teste/loja

npm install                  # 1. baixa as bibliotecas (demora alguns minutos)
cp .dev.vars.example .dev.vars   # 2. cria o arquivo de configuração local
npm run db:migrate:local     # 3. cria as tabelas do banco local
npm run db:seed:local        # 4. coloca produtos de exemplo
npm run dev                  # 5. liga a loja
```

> **No Windows (PowerShell)**, o passo 2 é:
> `Copy-Item .dev.vars.example .dev.vars`

No fim, o terminal mostra algo assim:

```
  ➜  Local:   http://localhost:5173/
```

Abra esse endereço no navegador. **A loja está funcionando.**

Deixe essa janela do terminal aberta: é ela que mantém a loja no ar. Para
desligar, aperte `Ctrl + C`.

---

## Entrando no painel

O painel local precisa de um usuário. Em **outra** janela de terminal (deixe a
primeira rodando), na mesma pasta:

```bash
npm run admin:create -- admin@teste.com "senha-de-teste-123"
```

Ele imprime um comando SQL. Copie a linha inteira e rode:

```bash
npx wrangler d1 execute loja-minecraft --local --command "COLE-O-SQL-AQUI"
```

Agora acesse <http://localhost:5173/admin> e entre com esse e-mail e senha.

> Repare no `--local`: ele diz "no banco do meu computador". Sem essa palavra, o
> comando mexeria no banco de produção.

---

## Fazendo uma compra de mentira

É aqui que fica interessante — dá para percorrer o fluxo inteiro sem banco,
sem Pix e sem dinheiro:

1. Na loja, escolha um produto e clique em **Comprar com Pix**.
2. Informe um nick (qualquer um — `Steve`, `Notch`) e um e-mail.
3. Clique em **Gerar Pix**. Aparece um QR Code **falso**, com contador e tudo.
4. Role até o fim e clique em **Simular pagamento (desenvolvimento)**.
5. Em poucos segundos, a página vira sozinha para **Pagamento confirmado**.
6. Abra o painel: o pedido está na fila **A entregar**.
7. Clique em **Entreguei** e volte à página do pedido: agora ela mostra entregue.

Esse botão de simular não é um atalho que "finge" o resultado: ele monta um aviso
de pagamento assinado e entrega ao mesmo endereço que o Mercado Pago usaria. O
que é exercitado é o caminho **real**, com conferência de assinatura e tudo.

> **Por que isso existe:** o ambiente de testes do Mercado Pago **não consegue
> pagar um Pix de verdade**. Sem o simulador, não haveria como testar a compra
> completa antes de estar no ar com dinheiro real.

Na loja publicada esse botão **não aparece** — o sistema recusa esse endereço
fora do ambiente de desenvolvimento.

---

## Testando o robô dos 5 minutos

A loja tem uma rotina que roda de tempos em tempos e confere os pedidos
pendentes (a rede de segurança de quando o aviso de pagamento se perde). Para
rodá-la na hora, sem esperar, com a loja ligada:

```bash
curl http://localhost:5173/cdn-cgi/handler/scheduled
```

Ele responde `ok`. Um pedido cujo prazo já passou aparece como **expirado**
depois disso; um que foi pago sem aviso aparece como **pago**.

---

## Onde ficam os seus dados locais

Tudo o que você cria no seu computador — produtos, pedidos, imagens, login —
fica na pasta escondida `.wrangler/state/`, dentro de `loja`. Ela **não vai para
o Git** e não tem nenhuma relação com o que estiver publicado.

Para **começar do zero**, apague essa pasta e refaça os passos 3 e 4:

```bash
rm -rf .wrangler/state
npm run db:migrate:local
npm run db:seed:local
```

No PowerShell: `Remove-Item -Recurse -Force .wrangler\state`

### Espiar o banco local

```bash
npx wrangler d1 execute loja-minecraft --local --command "SELECT public_id, nick, status, total_cents FROM orders"
```

Troque o comando SQL pelo que você quiser consultar.

---

## O arquivo `.dev.vars`

É a configuração da sua máquina. Ele **nunca vai para o Git** — é onde ficariam
senhas, se houvesse alguma. O modelo (`.dev.vars.example`) já vem pronto:

| Linha | O que faz |
|---|---|
| `ENVIRONMENT=development` | Liga o modo de desenvolvimento (com o botão de simular pagamento) |
| `PAYMENT_PROVIDER=mock` | Usa o Pix simulado. Trocar para `mercadopago` exige as credenciais reais |
| `SESSION_SECRET=...` | Qualquer texto serve aqui; em produção é um segredo de verdade |
| `PUBLIC_BASE_URL` | Deixe comentado localmente |

**Nunca coloque credenciais reais do Mercado Pago aqui** para "testar de
verdade": você estaria gerando cobranças reais a partir da sua máquina. O teste
com dinheiro de verdade é feito uma vez só, já publicado, com R$ 0,01 — está no
[guia de implantação](02-implantacao-cloudflare.md#passo-10--o-teste-final-com-dinheiro-de-verdade).

---

## Rodando os testes

O projeto tem 204 testes automáticos, incluindo 47 que **atacam a própria loja**
para conferir que as proteções continuam de pé.

```bash
npm test           # roda tudo (leva menos de um minuto)
npm run typecheck  # confere os tipos
```

Eles rodam sozinhos, sem precisar da loja ligada, e usam um banco descartável —
não encostam nos seus dados locais nem nos de produção.

**Se algum teste falhar, não publique.** É exatamente esse o trabalho deles.

Para acompanhar enquanto você mexe no código:

```bash
npm run test:watch
```

---

## Os comandos, em uma tabela

| Comando | Para quê |
|---|---|
| `npm run dev` | Liga a loja em <http://localhost:5173> |
| `npm test` | Roda os testes |
| `npm run typecheck` | Confere os tipos |
| `npm run build` | Monta a versão de produção (sem publicar) |
| `npm run deploy` | **Publica na internet** — só quando for a intenção |
| `npm run db:migrate:local` | Cria/atualiza as tabelas locais |
| `npm run db:seed:local` | Recoloca os produtos de exemplo |
| `npm run admin:create` | Gera o SQL do usuário do painel |

---

## Quando algo não funciona

### "npm não é reconhecido como comando"

O Node.js não está instalado, ou o terminal foi aberto antes da instalação.
Instale e **abra uma janela nova** de terminal.

### "Port 5173 is already in use"

Já existe uma loja rodando em outra janela. Feche-a (`Ctrl + C`) ou use outra
porta:

```bash
npx vite --port 5174
```

### O navegador não abre `http://localhost:5173`

Tente `http://127.0.0.1:5173`. Se só um dos dois funcionar, é o jeito como o seu
sistema resolve o nome `localhost`; para fixar no endereço numérico:

```bash
npx vite --host 127.0.0.1
```

### A loja abre, mas não aparece nenhum produto

Faltou o passo 4. Rode `npm run db:seed:local`.

### "no such table: products" ou erro parecido

Faltou o passo 3. Rode `npm run db:migrate:local`.

### Não consigo entrar no painel

- Confirme que você rodou os **dois** comandos da seção "Entrando no painel" — o
  primeiro só *imprime* o SQL, o segundo é que aplica.
- Errou a senha 5 vezes? Espere 15 minutos, ou apague `.wrangler/state` e
  recomece.

### Mudei um arquivo e a tela não mudou

O `npm run dev` atualiza a página sozinho ao salvar. Se não atualizar, recarregue
com `Ctrl + F5`. Se ainda assim não, desligue (`Ctrl + C`) e ligue de novo.

### Erros vermelhos no terminal ao instalar

Se `npm install` terminar com falha, apague `node_modules` e tente de novo:

```bash
rm -rf node_modules
npm install
```

---

## Depois de rodar localmente

Gostou do que viu e quer colocar no ar? Vá para
**[Como colocar a loja no ar](02-implantacao-cloudflare.md)**.

Quer entender o que está vendo? **[Guia das telas](01-guia-das-telas.md)**.
