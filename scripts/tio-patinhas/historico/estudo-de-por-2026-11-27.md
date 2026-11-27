# Estudo: "de/por" só quando o desconto é de verdade (27/11/2026)

Pedido do Bruno (27/11): "monta um estudo e aplicamos na semana que vem. Gostei de tirar o de/por quando for anúncio duvidoso, e depois a gente inclui o menor preço nos últimos XX dias depois de uns 3 meses de captação nossa."

## 1. O que medimos

**Página Black da Amazon (blackfriday/2, 120 produtos, 36 conferidos no Keepa, 90 dias):** o "De" da Amazon é o preço sugerido pelo fabricante (a própria página explica), não o que ela cobrava. Em todos os 36 o "De" estava acima do preço praticado. Uns 12 estavam no menor preço com 15%+ de queda real, uns 9 caíram 5 a 12%, uns 14 não baixaram nada (LEGO Bonsai, LEGO Messi, Bepantol Baby a R$ 39,18 que custou ~R$ 32 em 20/11, kit Nivea Milk...).

**Nossos posts (1.104 produtos nas campanhas de maternidade, 20 a 27/11):** comparados com o preço do mesmo produto nos dias anteriores (`preco_historico` desde 19/11 + `offers` desde set). Só dá pra conferir quem já tinha aparecido antes (Amazon 197, ML 78, Shopee 152).

| Loja | % anunciado médio | % real médio | real ≥5% | real ≥15% |
|---|---|---|---|---|
| Mercado Livre | 26% | 17% | 68% | 46% |
| Amazon | 28% | 9% | 55% | 32% |
| Shopee | 25% | 4% | 35% | 11% |

Uns 4% dos posts estavam mais caros do que antes. Magalu e Natura ficaram fora da conta (sem código de produto no histórico).

**Volume:** o estoque recebe ~1.080 ofertas novas/dia (ML 275, Amazon 359, Shopee 114, Magalu 163, Natura 173); ~430 têm marca conhecida ou nota ≥4,5. Postamos ~140 produtos diferentes/dia. Aplicando as taxas acima:
- régua "real ≥5% + marca boa": ~190/dia (ML ~82, Amazon ~70, Shopee ~35) > 140 ✅
- régua "real ≥15%": ~110/dia ❌ (completar com campeões, Magalu, Natura, cupons)
- Black (500/dia): não fecha com régua dura.

**Problema:** ~70% das ofertas do estoque aparecem pela 1ª vez, sem histórico pra comparar. O histórico começou em 19/11; com ~3 meses (meados de fev/2027) cobre a maior parte do que se repete.

## 2. Fase 1, semana de 30/11: tirar o "de/por" duvidoso (não corta volume)

Mexe só na legenda (`src/lib/caption.ts`: `priceBlock` mostra "> Custa R$ X" e `chamada` usa o % pra decidir a chamada em caixa alta). O post continua saindo; o que muda é mostrar ou não o preço antigo.

Regra proposta para mostrar o "Custa R$ X" (preço "de"):
1. **Com histórico nosso** (produto visto em 2+ dias nos 60 dias anteriores, sem contar o dia do post): mostra só se o preço de hoje está **10%+ abaixo da mediana** do histórico. O "de" mostrado passa a ser a **mediana nossa** (não o da loja), e o % sai dela.
2. **Sem histórico:**
   - Mercado Livre: mostra o "de" da loja se o % ficar entre 5 e 40% (o ML é o mais honesto).
   - Amazon: só se a página tiver o selo de menor preço em 30 dias (`promo_meta.menor_30d`); senão, sem "de".
   - Shopee: nunca mostra o "de" sem histórico.
   - Magalu/Natura: mantém como hoje (Natura é a loja da Day; Magalu lida pela extensão), revisar na fase 2.
3. **Chamada em caixa alta** ("OFERTA IMPERDÍVEL"...): só com desconto confirmado pela regra acima, cupom ou exclusiva. Sem "de", sem chamada de desconto.
4. Produto **mais caro que a mediana** nossa (+5%): não posta (sai da fila). É o único ponto que corta volume (~4%).

Implementação: o dispatcher já busca a oferta antes de postar; acrescentar uma leitura em `preco_historico` (mediana e dias vistos) e passar pro `buildCaption` um campo `ref_preco` + `ref_dias`. ~1 dia de trabalho, deploy pelo hook.

**Como medir (sem misturar com a separação de Fraldas/Cupons/Enxoval, que também começa em 01/12):** teste dentro da mesma semana. Metade dos posts sem histórico segue com o "de" da loja (como hoje), metade sem, alternando por post. Comparar cliques por post (`link_cliques`) entre as duas metades, por loja. Se o sem "de" não perder cliques (diferença <10%), vira regra pra todos.

## 3. Fase 1b, junto: garimpo (preferências, sem corte forte)

- Shopee: só marca conhecida ou nota ≥4,5 com 500+ vendidos (hoje o teto já é 10% e o genérico <R$ 20 exige 4,8 + 1.000 vendidos).
- Dar preferência na fila ao que tem desconto confirmado pelo histórico (sobe na ordem, não exclui o resto).
- ML ganha peso no mix quando faltar oferta confirmada nas outras lojas.

## 4. Fase 2, a partir de ~19/02/2027 (3 meses de captação)

- Selo "📉 Menor preço dos últimos 90 dias" quando o preço de hoje ≤ mínimo dos 90 dias e o produto tem leitura em pelo menos ~20 dias diferentes.
- "Menor preço dos últimos 30 dias" com pelo menos ~10 dias de leitura.
- Reavaliar a régua "real ≥15%" com o histórico maduro (deve sobrar volume).
- Conferir antes quanto do estoque já tem histórico suficiente (meta: 60%+ dos produtos postados).

## 5. Riscos

- A mediana nossa pode estar "contaminada" pelo próprio período de promoção (Black): na fase 1 usar só leituras de até 60 dias atrás e, em dezembro, desconsiderar 26 a 30/11 no cálculo da mediana.
- Produto que só aparece em promoção (coletor busca por desconto) puxa a mediana pra baixo: efeito é ficar mais conservador, não mostrar desconto falso.
- Lista de marcas usada na simulação é aproximada (regex); o número de "marca boa" pode variar ±20%.

Dados da simulação: scripts temporários (fora do repo) leram `publication_queue`, `offers`, `preco_historico`. Repetir com `preco_historico` + `offers` do período.
