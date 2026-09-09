# Operação e manutenção

O que fazer com a loja depois que ela estiver no ar: a rotina do dia a dia, os
custos, as cópias de segurança e o que fazer quando algo sai do esperado.

---

## A sua rotina

### Todo dia

1. Abra `seusite.com.br/admin`.
2. Olhe o número **A entregar**.
3. Para cada pedido da fila:
   - Clique no ícone ao lado do nick para **copiar o nick**.
   - Entregue o item no servidor.
   - Clique em **Entreguei**.
4. Olhe o número **Em revisão**. Se não for zero, resolva antes de fechar (veja
   abaixo).

> **Combine um prazo que você consegue cumprir.** O prazo prometido na loja é
> configurável ("em até 24 horas"). Prometer 10 minutos e entregar em 8 horas
> gera mais reclamação do que prometer 24 horas e entregar em 2.

### Toda semana

- Confira o saldo no Mercado Pago e faça a transferência para a sua conta.
- Dê uma olhada em quais produtos estão vendendo e quais não saem do lugar.

### Todo mês

- Faça uma **cópia de segurança do banco** (instruções mais abaixo).
- Confira se as vendas do painel batem com o extrato do Mercado Pago.

---

## Resolvendo um pedido "Em revisão"

Um pedido cai nessa aba quando o dinheiro chegou de um jeito que não fecha com o
esperado. O sistema **nunca entrega sozinho** nessa situação e **nunca finge que
o dinheiro não existe** — ele para e chama você, com uma anotação dizendo o que
houve.

| Anotação | O que aconteceu | O que fazer |
|---|---|---|
| Valor diferente do pedido | Pagaram a mais ou a menos | Confira no Mercado Pago. Pagou a menos: fale com a pessoa ou estorne. Pagou a mais: devolva a diferença ou entregue e combine |
| Pagamento depois de o pedido expirar | O QR venceu, mas a pessoa pagou assim mesmo | O dinheiro está na sua conta. Entregue normalmente, ou estorne |
| Pagamento depois de cancelado / estornado | O pedido foi fechado e o Pix caiu depois | Mesma coisa: o dinheiro é real. Decida entre entregar e estornar |
| Estoque não cobria a venda | Vendeu mais do que tinha | Entregue o que der e combine o resto, ou estorne |

Em todos os casos, o **estorno é feito no Mercado Pago**, não na loja. Depois,
marque o pedido como cancelado no painel para tirá-lo da sua vista.

---

## Cópia de segurança

O banco de dados fica na Cloudflare e não some sozinho, mas cópia de segurança é
barata e um dia salva o mês. Rode, no terminal, dentro da pasta `loja`:

```bash
npx wrangler d1 export loja-minecraft --remote --output=backup-2026-09-09.sql
```

Isso gera um arquivo com **todos os produtos, pedidos e configurações**. Guarde
em outro lugar (Google Drive, pen drive, o que for). Troque a data no nome a cada
cópia.

As imagens dos produtos ficam no R2 e não entram nesse arquivo. Se elas forem
importantes, guarde também os originais no seu computador.

---

## Custos

| Serviço | Plano gratuito cobre | Quando você passaria disso |
|---|---|---|
| **Cloudflare Workers** | Na ordem de 100 mil requisições por dia | Uma loja de servidor de Minecraft normalmente não chega perto |
| **D1** (banco) | Vários GB de espaço e milhões de leituras por dia | Idem |
| **R2** (imagens) | Alguns GB de armazenamento | Só se você subir centenas de imagens grandes |
| **KV** (sessões) | Suficiente para o login do painel | Idem |
| **Turnstile** | Grátis | — |
| **Mercado Pago** | — | **0,99% por venda** (confirme na sua conta) |
| **Domínio** | — | ~R$ 40 por ano, se você quiser um |

Na prática: **a hospedagem tende a custar zero**, e o único custo por venda é a
taxa do Mercado Pago. Os limites exatos do plano gratuito mudam de tempos em
tempos — confira em <https://developers.cloudflare.com/workers/platform/limits/>
se quiser o número do dia.

---

## Administradores do painel

### Adicionar outra pessoa

Cada moderador deve ter **o próprio usuário**. Nunca compartilhe o seu login: se
algo for alterado, você precisa saber por quem.

```bash
npm run admin:create -- moderador@email.com "uma-senha-forte-e-diferente"
npx wrangler d1 execute loja-minecraft --remote --command "COLE-O-SQL-QUE-FOI-IMPRESSO"
```

> Hoje **todo administrador tem os mesmos poderes**. Não existe perfil "só
> entrega". Dê acesso apenas a quem você confiaria para mexer em preços.

### Trocar uma senha

O mesmo comando, com o mesmo e-mail e a senha nova. Ele substitui a anterior.

### Esqueci a senha

Não existe "esqueci minha senha" — de propósito: um formulário desses seria mais
uma porta de entrada. Rode o comando acima com o seu e-mail e uma senha nova.

### Tirar o acesso de alguém

```bash
npx wrangler d1 execute loja-minecraft --remote --command "DELETE FROM admin_users WHERE email = 'exmoderador@email.com'"
```

Isso impede **novos** logins. Se a pessoa estiver com o painel aberto naquele
momento, a sessão dela ainda vale **por até 12 horas**. Para cortar o acesso na
hora, troque a chave que assina as sessões:

```bash
npx wrangler secret put SESSION_SECRET   # cole um valor novo e aleatório
```

Isso derruba **todo mundo** — inclusive você. É só entrar de novo com a sua
senha.

---

## Ver o que está acontecendo

Para acompanhar a loja ao vivo (útil quando alguém relata um problema):

```bash
npx wrangler tail
```

Isso mostra, em tempo real, as requisições que chegam e os erros que acontecem.
Feche com `Ctrl + C`.

O painel da Cloudflare também guarda esse histórico em **Workers & Pages →
loja-minecraft → Logs**.

---

## Problemas comuns

### "Um jogador diz que pagou e não recebeu"

1. Peça o **código do pedido** (ele aparece na tela do Pix) ou o nick.
2. No painel, aba **Todos**, procure por ele.
3. Pelo status:
   - **Pago** → está na sua fila. Entregue.
   - **Em revisão** → veja a tabela lá em cima.
   - **Aguardando Pix** → o pagamento não chegou até a loja. Peça o comprovante
     e confira no Mercado Pago. Se o dinheiro estiver lá e o pedido não virou,
     verifique a configuração do webhook.
   - **Expirado** → o código venceu antes do pagamento. Se ele pagou depois, o
     pedido teria ido para revisão; se não pagou, é só refazer a compra.

### "A loja saiu do ar"

Verifique nesta ordem:

1. `https://SEU-ENDERECO/api/health` responde? Se sim, o servidor está de pé.
2. O painel da Cloudflare mostra algum incidente?
3. Alguém publicou uma alteração recentemente? `npm run deploy` sobe a versão
   atual do código; se a última mudança quebrou algo, corrija e publique de novo.

### "Mudei um preço e a loja continua mostrando o antigo"

Recarregue a página segurando `Ctrl + F5`. Preços mudam na hora; o que pode estar
guardado é a página antiga no navegador de quem já estava com ela aberta.

### "Quero tirar um produto do ar agora"

Painel → Produtos → desmarque **Ativo na loja** → Salvar. Ele some do catálogo
imediatamente, sem apagar as vendas antigas.

---

## Boas práticas de venda

Coisas que não são técnicas, mas que fazem diferença nesse mercado:

- **Sempre preencha o "preço de" riscado.** O desconto visível é o que faz o card
  converter.
- **Nomes no padrão do mercado brasileiro:** `VIP OURO [30 DIAS]`,
  `CHAVE MÍSTICA [x5]`. O jogador já lê esse formato em toda loja de servidor.
- **A lista "Você vai receber" vende mais do que um texto corrido.** Use itens
  curtos, em bullets.
- **Tenha um produto barato** (R$ 5 a R$ 10). Ele existe para a primeira compra
  acontecer; a segunda costuma ser maior.
- **Entregue rápido nos primeiros dias.** A reputação de "a loja é confiável" se
  constrói no começo, e é ela que sustenta as vendas depois.

---

## Se um dia você quiser mais

Coisas que ficaram **de fora de propósito** nesta versão, e por onde começariam:

- **Entrega automática no jogo** — hoje é manual. O ponto natural de ligação é o
  momento em que o pedido vira "pago".
- **Carrinho com vários produtos** — o banco já suporta vários itens por pedido;
  falta só a tela.
- **Outras formas de pagamento** — a camada de pagamento é trocável: seria um
  arquivo novo, não uma reforma.

Os detalhes de cada uma estão no
[documento de estrutura do código](04-estrutura-do-codigo.md).
