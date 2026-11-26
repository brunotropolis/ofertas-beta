/**
 * Regra única de "o que cada perfil NUNCA posta" (25/Nov, Bruno: "aplica a correção em tudo", depois do Mapa das
 * Campanhas). Vale igual pros grupos (auto-enqueue) e pros canais (auto-categorias), pra um produto barrado no grupo
 * não passar pelo canal do mesmo perfil (caso do boneco Skibidi no BRUNOTROPOLIS CANAL).
 *
 *  - Maternas: precisa ter sinal de bebê (ou ser saúde/lenço/amamentação/fralda/gadget da mãe, que já têm posto no mix).
 *    Nunca brinquedo de criança maior, roupa ou beleza de adulto.
 *  - Mãe: nunca masculino, infantil, coisa de carro, eletrônico.
 *  - Lar: nunca eletrônico/informática, brinquedo, infantil.
 *  - Geek (Brunotropolis): nunca brinquedo, cama e banho, roupa comum.
 *
 * Devolve o motivo (texto curto) quando o produto está fora, ou null quando pode.
 */

const PERFIL = {
  maternas: "8e8332fa-ebd8-41d5-948f-21bb6cd27a97",
  lar: "9b2a012e-4d44-41b3-8f1c-896c55c57d18",
  mae: "aa6b7dcb-11c6-4e8f-bcab-5965ec51462d",
  geek: "f3887ae2-7b2c-462b-8984-e1e6618a0ba6",
};

// ── sinais ────────────────────────────────────────────────────────────────
export const SINAL_BEBE = /beb[eê]|\bbaby\b|infantil|rec[eé]m[- ]?nascid|\brn\b|maternidade|gestante|gr[aá]vida|amamenta|fralda|mamadeira|chupeta|mordedor|enxoval|\bbod(y|ies)\b|macac[aã]o|mij[aã]o|cueiro|\bmanta\b|ber[cç]o|carrinho de beb|beb[eê] conforto|cadeirinha|banheira|trocador|len[cç]os? umedecid|toalhas? umedecid|pomada|assadura|bepantol|hipogl|desitin|mustela|johnson|granado beb|aspirador nasal|sugador nasal|term[oô]metro|bab[aá] eletr|monitor de beb|tira ?leite|extrator de leite|bomba (de |tira )|copo de transi|babador|\b0 ?a ?\d+ meses|\bmeses\b|kids|crian[cç]a|chocalho|m[oó]bile|tapete de atividade|fisher.?price|montessori|copo (de )?(transi|treinamento)|copo antivazamento|leite materno|absorvente (para|de) seios|medela|\bnuk\b|avent|\bbuba\b|lillo|kuka|chicco|burigotto|galzerano|cadeira (para|de) (carro|auto)|grade de cama|andador|carrinho de passeio|caderneta de (sa[uú]de|vacina)|galinha pintadinha|palavrinhas|bolofofos|turma da m[oô]nica|pel[uú]cia|pampers|huggies|febre|talher|papinha|\bcapuz\b|\b\d+ ?m\+|leite em p[oó]|f[oó]rmula infantil|\bnan\b|aptamil|milnutri|ninho|nestonutri|mucilon|composto l[aá]cteo|mam[aã]e e beb[eê]|papai e beb[eê]/i;
// 26/Nov (estudo dos produtos, Bruno: "pode aplicar as 5"): o que a equipe postava e o robô parou de postar.
/** marcas de enxoval/equipamento que a mãe conhece (faixa do meio pra cima) */
export const MARCA_BOA = /burigotto|galzerano|cosco|kiddo|maxi ?baby|voyage|safety 1st|chicco|fisher.?price|clingo|motorola|philips|avent|infanti\b|tutti baby|multikids baby|mastela|dican|\bkuka\b|lillo|\bnuk\b|\bmam\b|tommee|dr\.? ?brown|medela|lansinoh|carter|pimpolho|hering|\bbuba\b|munchkin|skip ?hop|\bjoie\b|graco|maxi-?cosi|abc design|litet|baby trend|kikkaboo|tip top|elian|comtac|bright starts|baby einstein|intelbras|girotondo|\bpapi\b|ninho|nestl[eé]|aptamil|mustela|weleda|granado|johnson|pampers|huggies|bepantol|natura/i;
/** enxoval e equipamento (cadeirão, carrinho, berço, babá, banheira, bomba, mamadeira, roupa...) */
export const EQUIP = /cadeira (de |para )?(alimenta|refei)|cadeir[aã]o|carrinho de beb|carrinho (de )?passeio|travel system|ber[cç]o|mois[eé]s|cercad|chiqueir|bab[aá] eletr|monitor de beb|banheira|bomba (de |tira )|tira ?leite|extrator de leite|mamadeira|esteriliz|aquecedor de mamadeira|\bbod(y|ies)\b|macac[aã]o|kit enxoval|saco de dormir|cadeira de descanso|cadeira de balan|balan[cç]o (el[eé]trico|autom)|beb[eê] conforto|cadeirinha|cadeira (de |para )(carro|auto)|tapete de atividade|andador|canguru|sling|mochila maternidade|bolsa maternidade|trocador|c[oô]moda/i;
/** alimentação do bebê (leite, fórmula, papinha) */
export const ALIMENTA = /leite em p[oó]|f[oó]rmula infantil|\bnan\b|aptamil|milnutri|ninho|nestonutri|papinha|mucilon|cereal infantil|composto l[aá]cteo/i;

// brinquedo de criança maior / personagem (não é bebê)
const CRIANCA_MAIOR = /barbie|hot ?wheels|\bpista\b|\bnerf\b|\blego\b|pok[eé]mon|bob esponja|patrulha canina|skibidi|homem[- ]aranha|spider|marvel|frozen|sonic|mario|minecraft|roblox|\b([4-9]|1[0-6]) ?anos\b|\b([4-9]|1[0-6]) ?\+|\b([4-9]|1[0-6]) ?y\+|patinete|skate|boneco/i;
const ROUPA_ADULTO = /\b(cal[cç]a|vestido|blusa|camiseta|camisa|saia|short|bermuda|jaqueta|moletom|cueca|calcinha|suti[aã]|top fitness|legging|biqu[ií]ni|mai[oô])\b/i;
const BELEZA_ADULTO = /perfume|col[oô]nia|desodorante|antitranspirante|shampoo|condicionador|m[aá]scara capilar|creme de pentear|[oó]leo capilar|maquiagem|batom|\bbase\b|corretivo|r[ií]mel|esmalte|body splash|hidratante|s[eé]rum|skin ?care|tododia|kaiak|egeo|malbec|botic[aá]rio|natura\b|secador|chapinha|escova secadora|depila/i;
// 26/Nov (Bruno: "foi um barbeador hoje... negativação de palavras que podem ser de uso masculino"): saiu o Philips
// OneBlade no Mãe porque "barbeador" não casava com "barba"/"barbear".
const MASCULINO = /masculin|\bmen\b|for men|\bhomme\b|\bpour homme\b|\beros\b|\bbarbas?\b|barbe(ar|ador|adores|a[cç][aã]o)|barbeiro|p[oó]s.?barba|aparador (de )?(pelos|barba|nariz|orelha)|aparador el[eé]trico|oneblade|prestobarba|mach ?3|navalha|old spice|\baxe\b|cueca|\bdele\b|para ele\b|gillette(?!.*venus)/i;
const CARRO = /carro|automotiv|veicular|quebra[- ]?sol|para[- ]?sol|para[- ]brisa|pneu|calota|volante|\bmoto\b|capacete/i;
export const ELETRONICO = /notebook|laptop|chromebook|macbook|computador|\bpc\b|monitor(?! de beb)|celular|smartphone|iphone|galaxy|redmi|xiaomi|tablet|\bipad\b|smart ?tv|\btv\b|televis|console|playstation|\bps[45]\b|xbox|nintendo|placa de v[ií]deo|processador(?! de alimento)|\bssd\b|hd externo|mem[oó]ria ram|teclado|mouse|headset|fone de ouvido|\bfone\b|caixa de som|soundbar|smartwatch|rel[oó]gio inteligente|impressora|roteador|c[aâ]mera(?! de seguran)|drone|gamer|kindle|echo (dot|spot|show)|alexa|fire tv/i;
const BRINQUEDO = /brinquedo|boneca|boneco|pel[uú]cia|hot ?wheels|\bpista\b|barbie|playmobil|\bnerf\b|massinha|play-?doh|\blego\b|quebra-?cabe|jogo de tabuleiro|carrinho (de )?controle/i;
const COLECIONAVEL = /funko|colecion[aá]vel|action figure|estatueta|est[aá]tua|figure\b/i;
const CAMA_BANHO = /len[cç]ol|edredom|travesseiro|colcha|cobertor|fronha|toalha de (banho|rosto)|jogo de cama|roupão/i;
const ROUPA = /\b(camiseta|camisa|cal[cç]a|bermuda|cueca|meias?|cal[cç]ado|t[eê]nis|chinelo|jaqueta|moletom|bon[eé])\b/i;
const TEMA_GEEK = /star wars|marvel|\bdc\b|batman|harry potter|anime|naruto|one piece|dragon ball|pok[eé]mon|senhor dos an[eé]is|stranger things|geek|nerd|gamer/i;
// itens da casa que a Maternas aceita (posto de gadget da mãe, decisão 12/Nov)
const GADGET_MAE = /bab[aá] eletr|air ?fryer|fritadeira|esteriliz|aquecedor de mamadeira|umidificador|purificador|liquidificador|mixer|processador de alimento|aspirador|panela el[eé]trica|cafeteira|ventilador|nebuliz|c[aâ]mera.*(seguran|wi-?fi)/i;

/** título que não é nome de produto: pedaço de post do Telegram ("G com 168 (0,92 por unidade):", "DA LUPO") */
export function tituloQuebrado(titulo: string | null | undefined): boolean {
  const t = (titulo || "").trim();
  if (!t) return false;
  return t.length < 12 ||/:\s*$/.test(t) || /^(rn|p|m|g|xg|xxg|xxxg|gg|eg)\s+com\s+\d/i.test(t);
}

// 26/Nov (Bruno: "manda ver em tudo", orientação de casa e beleza a partir dos concorrentes): Lar e Mãe passam a ter
// lista do que PRECISA ter (antes só havia "nunca"; no teste 274 de 284 produtos de casa passariam no Mãe).
// 26/Nov (mais tarde): "só entra o que bate numa categoria" passou pra regra de cada campanha (campaigns.regras,
// aba Regras). CASA e BELEZA ficaram aqui só como origem das listas que foram pro banco.
// Categoria = a primeira que casar (a ordem importa: mais específica primeiro, cozinha e corpo por último). Usado também nas cotas por categoria do auto-enqueue.
export const CASA: Record<string, RegExp> = {
  eletro_grande: /geladeira|refrigerador|freezer|m[aá]quina de lavar|lavadora de roupas|lava e seca|lava.?lou[cç]as|fog[aã]o|cooktop|forno de embutir|ar.?condicionado|split|adega|tanquinho|secadora de roupa/i,
  eletroportatil: /panificadora|moedor de caf|m[aá]quina de (p[aã]o|gelo|algod[aã]o doce)|air ?fryer|fritadeira|liquidificador|batedeira|mixer|processador|sanduicheira|grill|torradeira|cafeteira|chaleira|panela el[eé]trica|panela de press[aã]o el|forno el[eé]trico|micro.?ondas|espremedor|ferro de passar|vaporizador de roupa|aspirador|rob[oô] aspirador|ventilador|climatizador|purificador|umidificador|desumidificador|mop el[eé]trico|lavadora de alta|seladora|m[aá]quina de caf[eé]|nespresso|dolce gusto/i,
  limpeza: /sacos? (para|de) lixo|dover.?roll|desengordurante|pastilha (de limpeza|degreaser)|cif\b|pano m[aá]gico|microfibra (de limpeza|para limpeza)|papa.?bolinha|removedor de fiapo|toalha de papel|armadilha|mata.?mosquito|raquete el[eé]trica|ratoeira|tela protetor(a)? de ralo|desentupidor|sab[aã]o|amaciante|lava.?roupas?|detergente|desinfetante|[aá]gua sanit[aá]ria|alvejante|tira.?manchas|multiuso|limpador|limpa vidro|lustra|esponja|pano de (ch[aã]o|prato|limpeza)|papel higi[eê]nico|papel toalha|guardanapo|saco de lixo|vassoura|rodo|\bmop\b|balde|inseticida|repelente (el[eé]trico|de tomada)|neutralizador|odorizador|bom ar|veja|omo|yp[eê]|downy|comfort|vanish|brilhante|ariel|lysoform|pinho sol|neve|scott|personal (vip|folha)/i,
  cama_banho: /toalha|jogo de banho|beliche|cabeceira|cama box|\bcama (casal|solteiro|queen|king)|len[cç][oó]is|jogo (de )?cama|coberdrom|edredom|capacho|toalha (de )?mesa|jogo americano|cobre.?sof[aá]|manta|roupa de cama|len[cç]ol|edredom|edredon|cobertor|manta (de sof[aá]|para cama|microfibra)|colcha|cobre.?leito|travesseiro|fronha|jogo de cama|toalha de (banho|rosto|mesa)|toalh[aã]o|jogo de toalha|roup[aã]o|tapete|cortina|almofada|capa de (sof[aá]|almofada)|colch[aã]o|protetor de colch[aã]o|buddemeyer|santista|altenburg|karsten|teka|emma/i,
  decoracao: /adorno|flor artificial|flores artificiais|planner|lugar americano|decora|vaso|quadro|lumin[aá]ria|abajur|lustre|vela|aromatiz|difusor|espelho|planta artificial|enfeite|porta.?retrato|rel[oó]gio de parede|fita de led|natal|arranjo/i,
  organizacao: /guarda.?roupa|cadeira|mesa (de jantar|lateral|de centro|dobr[aá]vel)|banqueta|sof[aá]|aparador|poltrona|puff|cabideiro|moldura|desk ?pad|torneira|ducha|chuveiro|ralo|assento sanit[aá]rio|kit banheiro|porta.?escova|organizador|caixa organiz|cesto|cabide|varal|sapateira|prateleira|nicho|gancho|suporte (de|para) parede|porta.?(objetos|treco|controle|papel)|arm[aá]rio|estante|gaveteiro|rack|cômoda|comoda|mala|necessaire de viagem/i,
  cozinha: /saladeira|copos?\b|bowl|petisqueira|kit bartender|coqueteleira|ma[cç]arico de cozinha|cortador|ta[cç]as?\b|jogo de jantar|aparelho de jantar|jogo de x[ií]caras|filme (pvc|pl[aá]stico)|papel alum[ií]nio|saco (zip|herm[eé]tico)|lixeira|porta.?frios|descascador|peneira|centr[ií]fuga de alimentos|cuscuzeira|chaleira de inox|panela|frigideira|ca[cç]arola|wok|jogo de panelas|faqueiro|talher|faca|t[aá]bua|pote|marmita|garrafa t[eé]rmica|copo t[eé]rmico|caneca|x[ií]cara|prato|travessa|assadeira|forma (de|para)|refrat[aá]ri|escorredor|porta.?temper|lixeira de pia|utens[ií]lio|esp[aá]tula|concha de cozinha|abridor|ralador|tupperware|jarra|squeeze|stanley|tramontina|brinox|oikos|marinex|electrolux.*(pia|filtro)/i,
};
export const BELEZA: Record<string, RegExp> = {
  bem_estar: /col[aá]geno|verisol|whey|creatina|vitamina (d|c|b|e)\b|multivitam|[oô]mega.?3|magn[eé]sio|suplemento|biotina|termog[eê]nico|pr[eé].?treino|prote[ií]na|caf[eé] (em c[aá]psula|gourmet|especial|em gr[aã]os|mo[ií]do)|c[aá]psulas? de caf[eé]|ch[aá] (verde|detox|de)|vitafor|growth|integralmedica|max titanium|dux|essential nutrition|sanavita|melatonina/i,
  aparelho: /depilar|venus|balan[cç]a (corporal|de bioimped)|modelador(a)?|cacheador(a)?|chapinha|prancha|secador|chapinha|prancha (alisadora|de cabelo)|escova (secadora|alisadora|rotativa|modeladora)|babyliss|modelador de cachos|depilador|epilador|escova (de dente|dental) el[eé]trica|oral.?b|irrigador oral|massageador|aparelho de (manicure|pedicure)|lixa el[eé]trica|taiff|cadence|gama italy/i,
  maquiagem: /manicure|pedicure|esp[aá]tula.*(unha|cut[ií]cula)|alicate de cut[ií]cula|batons?\b|baton|maquiag|batom|base (l[ií]quida|matte|de maquiagem)|corretivo|p[oó] (compacto|solto|facial)|blush|bronzer|iluminador|sombra|paleta|r[ií]mel|m[aá]scara de c[ií]lios|delineador|l[aá]pis de (olho|boca)|gloss|primer|fixador de maquiagem|esponja de maquiagem|pinc[eé]is? de maquiagem|esmalte|unha|removedor de esmalte|ruby rose|vult|maybelline|max love|dailus|mari maria|bruna tavares|boca rosa|\bmac\b/i,
  cabelo: /m[aá]scara.{0,30}capilar|terapia capilar|hen[eê]\b|reposi[cç][aã]o de (massa|carbono)|creme (para|pra) pentear|creme pentear|ampola|blindagem|plancton|relaxamento|alisamento|progressiva|botox capilar|cronograma capilar|widi care|bra[eé]\b|apice|cadiveu|lowell|forever liss|novex|skala|cantu|nutri waves|kit capilar|shampoo|condicionador|m[aá]scara (capilar|de hidrata|de tratamento)|creme de pentear|[oó]leo capilar|leave.?in|finalizador|tonalizante|tintura|colora[cç][aã]o|kit (capilar|cronograma|tratamento)|ampola capilar|elseve|pantene|wella|k[eé]rastase|redken|joico|lola|salon line|truss|siage|inoar|tresemm[eé]|seda\b|haskell|bio extratus|cachos|antiqueda|reconstru[cç][aã]o/i,
  pele: /ampoule|centella|base stick|skin1004|retinal|soro facial|booster|m[aá]scara facial|estrias|celimax|skin ?care|hidratante (para estria|facial)|gel facial|ac[ií]do|protetor labial|s[eé]rum|hidratante facial|creme facial|protetor solar|filtro solar|sabonete facial|gel de limpeza|[aá]gua micelar|t[oô]nico facial|esfoliante facial|anti.?idade|antissinais|retinol|vitamina c|niacinamida|[aá]cido hialur|cetaphil|neutrogena|la roche|vichy|cerave|bioderma|eucerin|principia|sallve|creamy|episol|isdin|nivea (facial|cellular)|photoage|demaquilante|olheira|clareador|cicatricure|aquaphor/i,
  corpo_perfume: /kit perfumado|sabonetes?\b|sab[aã]o em barra|fragr[aâ]ncia|\bedp\b|\bedt\b|deo parfum|deo col[oô]nia|[oó]leo de am[eê]ndoas|creme de massagem|hidratante (para (as )?m[aã]os|de m[aã]os)|enxaguante bucal|listerine|creme dental|clareamento dental|xerjoff|una\b|humor\b|rhenuks|glitter|perfume|eau de (parfum|toilette)|col[oô]nia|desodorante|body splash|hidratante corporal|lo[cç][aã]o (hidratante|corporal)|[oó]leo corporal|creme (corporal|para (as )?m[aã]os|para os p[eé]s)|manteiga corporal|sabonete (l[ií]quido|em barra)|esfoliante corporal|natura|botic[aá]rio|eudora|o\.?u\.?i|granado|l.?occitane|oc[eé]ane|bio.?oil|dove|nivea|tododia|ekos|kaiak|lily|malbec|egeo|floratta|essencial/i,
};
export const catDe = (cats: Record<string, RegExp>, titulo: string | null | undefined): string | null => { const t = titulo || ""; for (const [k, r] of Object.entries(cats)) if (r.test(t)) return k; return null; };

export function foraDoPerfil(perfilId: string | null | undefined, titulo: string | null | undefined): string | null {
  const t = titulo || "";
  if (!t) return null;
  if (tituloQuebrado(t)) return "título quebrado";
  switch (perfilId) {
    case PERFIL.maternas: {
      if (CRIANCA_MAIOR.test(t) && !/\b(0|1|2|3) ?(a|\+|meses)/i.test(t)) return "brinquedo de criança maior";
      if (SINAL_BEBE.test(t)) return null;
      if (GADGET_MAE.test(t)) return null;
      if (ROUPA_ADULTO.test(t)) return "roupa de adulto";
      if (BELEZA_ADULTO.test(t)) return "beleza de adulto";
      return "sem sinal de bebê";
    }
    case PERFIL.mae: {
      if (MASCULINO.test(t)) return "masculino";
      if (CARRO.test(t)) return "coisa de carro";
      if (/beb[eê]|\bbaby\b|infantil|crian[cç]a|\bkids?\b|\brn\b|rec[eé]m[- ]?nascid|fralda|mamadeira|chupeta|brinquedo/i.test(t)) return "infantil";
      if (ELETRONICO.test(t)) return "eletrônico";
      return null;
    }
    case PERFIL.lar: {
      if (ELETRONICO.test(t)) return "eletrônico";
      if (BRINQUEDO.test(t) && !/organizador/i.test(t)) return "brinquedo";
      if (SINAL_BEBE.test(t)) return "infantil";
      return null;
    }
    case PERFIL.geek: {
      if (BRINQUEDO.test(t) && !COLECIONAVEL.test(t) && !/gamer|celular/i.test(t)) return "brinquedo";
      if (/barbie|hot ?wheels|skibidi|patrulha canina|\b\d{1,2} ?y\+|\b\d{1,2}\+ ?anos/i.test(t) && !COLECIONAVEL.test(t)) return "brinquedo";
      if (/infantil|\bkids\b|crian[cç]a|beb[eê]/i.test(t)) return "infantil";
      if (CAMA_BANHO.test(t)) return "cama e banho";
      if (ROUPA.test(t) && !TEMA_GEEK.test(t)) return "roupa comum";
      return null;
    }
  }
  return null;
}
