---
name: design-system
description: Tokens, componentes e regras visuais da loja. Use SEMPRE antes de criar ou alterar qualquer tela, componente ou estilo — inclusive para "só um ajuste rápido" de cor, espaçamento ou tipografia.
---

# Design system da loja

Direção: **dark gamer premium, clean**. A profundidade vem da escala de
superfícies, não de bordas em tudo. O acento é escasso de propósito.

Os tokens vivem em `loja/src/app/styles/theme.css`, dentro do bloco `@theme` do
Tailwind v4. **Nunca escreva um valor de cor, raio ou sombra direto no
componente** — se falta um token, adicione ao tema e use pelo nome.

## Tokens

| Grupo | Tokens | Uso |
|---|---|---|
| Superfície | `surface-0` … `surface-3`, `surface-inset` | 0 = fundo da página; sobe conforme o elemento se eleva. `inset` é para poços (input, área de imagem). |
| Traço | `line`, `line-strong` | `line` no repouso, `line-strong` no hover. |
| Texto | `ink`, `ink-muted`, `ink-faint` | Título / corpo / rótulo secundário. |
| Acento | `accent`, `accent-hover`, `accent-dim`, `accent-ink`, `accent-glow` | `accent-ink` é a cor do texto **sobre** o acento. |
| Semântico | `warn`, `danger`, `info` | Estado, nunca decoração. |
| Fonte | `font-display`, `font-sans` | Outfit nos títulos, Inter no texto. |
| Raio | `radius-card`, `radius-control` | Card e controle. |
| Sombra | `shadow-card`, `shadow-lift` | Repouso e hover. |

## Regras

**O acento é escasso.** Só três coisas podem usar esmeralda cheia: o CTA de
compra, o preço e o estado ativo (aba/filtro selecionado). Se tudo brilha, o
botão de comprar deixa de chamar atenção — e é ele que converte.

**Contraste mínimo AA.** Texto sobre `surface-0`/`surface-1` usa `ink` ou
`ink-muted`. `ink-faint` só para rótulo curto e não essencial, nunca para texto
que o usuário precise ler para decidir a compra.

**Preço usa `.tabular`.** Sem `font-variant-numeric: tabular-nums` a coluna de
preços dança quando o número muda de largura.

**Hover é elevação, não troca de cor.** Card: `-translate-y-1` +
`shadow-lift` + `line-strong`. Duração 200–300ms com `--ease-out-soft`.

**Estado de foco nunca é removido.** O `:focus-visible` global já resolve; não
sobrescreva com `outline-none` sem repor algo visível.

**Toda animação respeita `prefers-reduced-motion`** — já tratado globalmente no
`@layer base`; não crie animação em JS que ignore isso.

## Componentes canônicos

Reutilize, não recrie:

- `components/Botao.tsx` — `Botao` e `BotaoLink`, variantes
  `primario` | `secundario` | `fantasma`, tamanhos `sm` | `md` | `lg`.
- `components/Selo.tsx` — etiquetas curtas, tons `accent` | `neutro` | `warn` | `danger`.
- `components/ProdutoCard.tsx` — card de produto e o esqueleto de carregamento.
- `components/Icones.tsx` — SVG inline. Um punhado de ícones não justifica uma
  biblioteca; adicione o novo ícone aqui, no mesmo estilo (traço 1.6, 24×24).
- `lib/cn.ts` — junção de classes.

## Carregamento e vazio

Toda lista tem **esqueleto com a mesma silhueta** do conteúdo real (o layout não
pode "pular") e **estado vazio com frase em português**, nunca uma área em branco.

## Responsivo

Mobile-first: a maioria dos jogadores compra pelo celular, com o app do banco no
mesmo aparelho. Grid de produtos: 1 coluna → `sm:` 2 → `lg:` 4. Em telas de
compra, o CTA principal fica acessível sem rolagem.
