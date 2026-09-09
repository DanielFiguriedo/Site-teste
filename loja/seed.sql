-- Sample data for development.
-- Prices are in CENTS. Product names follow the Brazilian convention: uppercase
-- with the modifier in brackets (VIP OURO [30 DIAS], CHAVE MÍSTICA [x5]).
-- The content itself stays in Portuguese: it is what the player reads.

DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM products;
DELETE FROM categories;
DELETE FROM settings;

INSERT INTO categories (id, slug, name, description, icon, position, active) VALUES
  (1, 'vip',    'VIP',          'Cargos com vantagens exclusivas no servidor.', 'crown',   1, 1),
  (2, 'cash',   'Cash',         'Moeda do servidor para usar na loja do jogo.', 'coins',   2, 1),
  (3, 'kits',   'Kits e Itens', 'Equipamentos, kits e itens especiais.',        'package', 3, 1),
  (4, 'chaves', 'Chaves',       'Chaves para abrir as caixas misteriosas.',     'key',     4, 1);

INSERT INTO products
  (category_id, slug, name, short_description, description_md, price_cents, original_price_cents, duration_days, giftable, pay_what_you_want, featured, stock, position, active)
VALUES
  (1, 'vip-bronze-30', 'VIP BRONZE [30 DIAS]',
   'O primeiro passo. Kit diário e comandos extras.',
   '### Você vai receber
- Cargo **VIP BRONZE** por 30 dias
- Kit diário exclusivo
- Comandos `/hat` e `/nick`
- 2 homes adicionais
- Prefixo colorido no chat',
   990, 1490, 30, 1, 0, 0, NULL, 1, 1),

  (1, 'vip-ouro-30', 'VIP OURO [30 DIAS]',
   'O mais vendido. Kit reforçado, /fly na spawn e 5 homes.',
   '### Você vai receber
- Cargo **VIP OURO** por 30 dias
- Kit diário reforçado
- `/fly` liberado na spawn
- 5 homes adicionais
- Chat exclusivo de VIPs
- Entrada garantida com o servidor cheio',
   1990, 3490, 30, 1, 0, 1, NULL, 2, 1),

  (1, 'vip-diamante-90', 'VIP DIAMANTE [90 DIAS]',
   'Três meses de tudo liberado, com kit lendário.',
   '### Você vai receber
- Cargo **VIP DIAMANTE** por 90 dias
- Kit lendário semanal
- `/fly` em todos os mundos
- 10 homes adicionais
- Acesso antecipado aos eventos
- 2 chaves místicas por semana',
   4990, 7990, 90, 1, 0, 1, NULL, 3, 1),

  (1, 'vip-eterno', 'VIP ETERNO [PERMANENTE]',
   'Pagou uma vez, é para sempre. Nunca expira.',
   '### Você vai receber
- Cargo **VIP ETERNO**, sem data de expiração
- Todos os benefícios do VIP DIAMANTE
- Tag exclusiva no chat e na TAB
- Prioridade máxima na fila de entrada',
   14990, 24990, NULL, 1, 0, 1, 25, 4, 1),

  (1, 'apoiar-servidor', 'APOIAR O SERVIDOR',
   'Contribua com o valor que quiser para manter o servidor no ar.',
   '### Obrigado pelo apoio!
Sua contribuição paga a hospedagem e mantém o servidor online.
Quem apoia ganha a tag **APOIADOR** no chat.',
   500, NULL, NULL, 0, 1, 0, NULL, 99, 1),

  (2, 'cash-1000', 'CASH [1.000]',
   '1.000 de cash creditados no seu nick.',
   '### Você vai receber
- **1.000 cash** creditados no seu nick',
   590, NULL, NULL, 1, 0, 0, NULL, 1, 1),

  (2, 'cash-5000', 'CASH [5.000]',
   '5.000 de cash, com 15% de bônus.',
   '### Você vai receber
- **5.000 cash** creditados no seu nick
- Bônus de 15% em relação ao pacote menor',
   2490, 2950, NULL, 1, 0, 1, NULL, 2, 1),

  (2, 'cash-15000', 'CASH [15.000]',
   'O melhor custo por unidade da loja.',
   '### Você vai receber
- **15.000 cash** creditados no seu nick
- O melhor custo por unidade da loja',
   5990, 8850, NULL, 1, 0, 0, NULL, 3, 1),

  (3, 'kit-guerreiro', 'KIT GUERREIRO',
   'Armadura de diamante completa e encantada.',
   '### Você vai receber
- Armadura de diamante **Proteção IV** completa
- Espada de diamante **Afiação V**
- 32 maçãs douradas
- 1 elytra',
   1290, 1990, NULL, 1, 0, 0, NULL, 1, 1),

  (3, 'kit-construtor', 'KIT CONSTRUTOR',
   'Blocos e ferramentas para construir sem parar.',
   '### Você vai receber
- 3.456 blocos variados
- Picareta **Eficiência V** com Inquebrável III
- 64 andaimes',
   890, NULL, NULL, 1, 0, 0, NULL, 2, 1),

  (3, 'spawner-blaze', 'SPAWNER DE BLAZE',
   'Um gerador de blaze para a sua farm.',
   '### Você vai receber
- 1x **Spawner de Blaze**
- Entregue diretamente no seu inventário',
   3490, 4490, NULL, 1, 0, 0, 10, 3, 1),

  (4, 'chave-mistica-x5', 'CHAVE MÍSTICA [x5]',
   'Cinco chances na Caixa Mística.',
   '### Você vai receber
- **5 chaves místicas**
- Cada chave abre uma Caixa Mística na spawn',
   1490, 1990, NULL, 1, 0, 0, NULL, 1, 1),

  (4, 'chave-lendaria-x3', 'CHAVE LENDÁRIA [x3]',
   'Três chances nos itens mais raros do servidor.',
   '### Você vai receber
- **3 chaves lendárias**
- Prêmios exclusivos, incluindo cosméticos e pets',
   2990, 3990, NULL, 1, 0, 1, NULL, 2, 1);

INSERT INTO settings (key, value) VALUES
  ('server_name',     'MeuServidor'),
  ('server_ip',       'jogar.meuservidor.com.br'),
  ('discord_invite',  ''),
  ('delivery_time',   'em até 24 horas'),
  ('delivery_notice', 'A entrega é feita manualmente pela nossa equipe. Assim que o Pix for confirmado, seu pedido entra na fila e você recebe os itens no jogo.');
