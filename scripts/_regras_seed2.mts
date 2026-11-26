// Regras de Fraldas, Cupons, Enxoval e Brunotropolis (26/Nov, Bruno: "cria as regras para o brunotropolis" e
// "separar fraldas, cupons e enxoval como campanhas também"). Uso: npx tsx --tsconfig tsconfig.json scripts/_regras_seed2.mts [--gravar]
import fs from "node:fs";
import { categoriaDe, norm, foraDasRegras, type RegrasCampanha } from "../src/lib/regras-campanha.ts";
import { foraDoPerfil } from "../src/lib/regras-perfil.ts";

const w = (s: string) => s.split(",").map((x) => norm(x).trim()).filter(Boolean);

// ── Brunotropolis (tecnologia e geek; nada de brinquedo, cama e banho, roupa comum: isso segue fixo no código) ──
const marcasGeek = w("jbl, samsung, xiaomi, redmi, logitech, redragon, hyperx, razer, corsair, anker, soundcore, apple, iphone, airpods, amazon, echo, alexa, kindle, fire tv, sony, playstation, xbox, nintendo, philips, edifier, kingston, sandisk, western digital, seagate, crucial, lenovo, dell, acer, asus, lg, tp link, tp-link, intelbras, motorola, huawei, haylou, qcy, baseus, ugreen, elg, havit, hp, epson, canon, gopro, dji, garmin, multilaser, positivo, funko, hasbro, bandai, iron studios, panini, darkside, intrinseca, rocco, companhia das letras, harpercollins, suma, alta books, wap, philco, mondial, arno, oster, britania, tuya, positivo casa inteligente, geonav, pisc");
const geek: RegrasCampanha = {
  so_categorias: true, marcas: marcasGeek,
  categorias: [
    { nome: "Áudio (fone, caixa de som)", palavras: w("fone, fones, headphone, headset, earbuds, airpods, freebuds, buds, caixa de som, soundbar, boombox, microfone, soundcore, jbl"), meta: 20, teto: null, marca_primeiro: true },
    { nome: "Casa inteligente e Alexa", palavras: w("echo dot, echo spot, echo show, echo pop, alexa, fire tv, chromecast, tv box, tomada inteligente, tomada wi-fi, tomada wifi, smart plug, interruptor inteligente, lampada inteligente, lampada smart, camera wifi, camera wi-fi, camera de seguranca, camera ip, robo aspirador, aspirador robo, aspirador de po robo, fechadura digital, campainha, sensor de presenca, controle universal, hub inteligente, philips hue, lampada led smart, smart wi-fi, smart wifi, lampada wi-fi"), meta: 20, teto: null, marca_primeiro: true },
    { nome: "Informática e periféricos", palavras: w("ssd, hd externo, hd interno, pendrive, pen drive, cartao de memoria, cartao micro sd, mouse, teclado, mousepad, mouse pad, webcam, monitor, roteador, mesh, repetidor, hub usb, hub tipo c, adaptador hub, estacao de acoplamento, notebook, chromebook, placa de video, memoria ram, processador, gabinete, fonte atx, cooler, impressora, suporte para monitor, suporte de notebook, mesa digitalizadora, leitor de cartao, desk pad, adaptador tipo c, adaptador usb, cabo hdmi, hdmi, placa mae, nobreak"), meta: 20, teto: null, marca_primeiro: true },
    { nome: "Games", palavras: w("controle, dualsense, joystick, gamepad, ps5, ps4, playstation, xbox, nintendo, switch, jogo para, jogo de ps, jogo ps5, game, gamer, mobilador, cadeira gamer, volante gamer"), meta: 10, teto: null, marca_primeiro: true },
    { nome: "Celular e acessórios", palavras: w("smartphone, celular, iphone, galaxy, redmi, carregador, power bank, powerbank, bateria externa, cabo usb, cabo tipo c, cabo lightning, capinha, pelicula, suporte de celular, smartwatch, relogio inteligente, smart band, smartband, smart watch, apple watch, amazfit, galaxy watch, tablet, ipad"), meta: 10, teto: null, marca_primeiro: true },
    { nome: "Geek e colecionáveis", palavras: w("funko, action figure, figura de acao, estatueta, colecionavel, colecionaveis, marvel, star wars, harry potter, hogwarts, senhor dos aneis, anime, naruto, one piece, dragon ball, pokemon, demon slayer, stranger things, dc comics, batman, homem aranha, spider man, caneca geek, mario bros, super mario, zelda, lego"), meta: 10, teto: null, marca_primeiro: false },
    { nome: "Livros, HQ e Kindle", palavras: w("livro, livros, box, hq, quadrinho, quadrinhos, manga, graphic novel, edicao, kindle, e-reader, leitor digital, capa kindle"), meta: 10, teto: null, marca_primeiro: false },
    { nome: "TV e vídeo", palavras: w("smart tv, tv 4k, tv led, tv 32, tv 43, tv 50, tv 55, tv 65, tv 70, televisao, antena digital, suporte de tv, suporte para tv, projetor, soundbar"), meta: 5, teto: null, marca_primeiro: true },
    { nome: "Eletroportátil (air fryer, cafeteira)", palavras: w("air fryer, airfryer, fritadeira, forno eletrico, cafeteira, dolce gusto, nespresso, liquidificador, mixer, sanduicheira, ventilador, aspirador de po vertical"), meta: 0, teto: 10, marca_primeiro: true },
  ],
  teto_shopee: null, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: 20, nunca: [], lojas: [], so_marcas: false, so_promocao: false,
};

// ── Fraldas: o teste combinado em 25/11 vira regra editável ──
const fraldas: RegrasCampanha = {
  so_categorias: false, marcas: w("pampers, huggies"), so_marcas: true, lojas: ["amazon", "ml"], so_promocao: false, nunca: [],
  categorias: [["G", 27], ["XG", 22], ["M", 20], ["P", 13], ["XXG", 10], ["RN", 5], ["XXXG", 3]].map(([t, m]) => ({ nome: String(t), palavras: [String(t).toLowerCase()], meta: Number(m), teto: null })),
  teto_shopee: null, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: null,
};

// ── Cupons: lojas com link nosso; sem palavras proibidas por enquanto ──
const cupons: RegrasCampanha = {
  so_categorias: false, marcas: [], categorias: [], lojas: ["ml", "shopee", "magalu"], nunca: [], so_marcas: false, so_promocao: false,
  teto_shopee: null, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: null,
};

// ── Enxoval: as listas que estavam no código (ENXOVAL, roupa de bebê, FORA) ──
const enxoval: RegrasCampanha = {
  so_categorias: true, marcas: [], so_marcas: false, lojas: [], so_promocao: false,
  categorias: [
    { nome: "Enxoval e quarto", palavras: w("enxoval, body, bodies, macacao, mijao, cueiro, manta, toalha de banho, toalha com capuz, toalha fralda, fralda de pano, kit berco, lencol de berco, lencol para berco, saida maternidade, saida de maternidade, bolsa maternidade, touca, luvinha, pagao, kit higiene, kit de higiene, banheira, trocador, fraldario, ninho, mosquiteiro, saco de dormir, bebe conforto, berco, carrinho de bebe, kit recem nascido, kit bebe"), meta: 0, teto: null },
    { nome: "Roupinha de bebê", palavras: w("roupa de bebe, roupinha, conjunto bebe, conjunto de bebe, pijama bebe, pijama de bebe, meia bebe, meias bebe, sapatinho, kit roupa bebe, conjunto rn, body rn, roupa rn, conjunto recem nascido"), meta: 0, teto: null },
  ],
  nunca: w("2 anos, 3 anos, 4 anos, 5 anos, 6 anos, 7 anos, 8 anos, 10 anos, 12 anos, 14 anos, adulto, gestante, pet, cachorro, gato, boneca, brinquedo, fralda descartavel, fraldas descartaveis, pampers, huggies, turma da monica, babysec, mamypoko, sabao, amaciante, detergente, lava roupa, lava roupas, para roupas, tira manchas, shampoo, condicionador, lenco umedecido, lencos umedecidos, protetor de berco, kit berco"),
  teto_shopee: null, sem_marca_abaixo_de: null, shopee_generico_abaixo_de: null,
};
// kit berço saiu da lista do que entra (lista de bloqueio do Bruno, 26/11)
enxoval.categorias[0].palavras = enxoval.categorias[0].palavras.filter((p) => p !== "kit berco");

// teste do Brunotropolis no estoque
const D = "C:/Users/bruno/AppData/Local/Temp/claude/b70d0e96dfc39538/bf528d48-c65d-46db-a590-f794696b57f2/scratchpad/";
const a: { title: string; platform: string }[] = JSON.parse(fs.readFileSync(D + "pool_geek.json", "utf8"));
const cont: Record<string, number> = {}; const sem: string[] = [];
for (const o of a) { const k = categoriaDe(geek, o)?.nome ?? "(fora)"; cont[k] = (cont[k] ?? 0) + 1; if (k === "(fora)" && !foraDoPerfil("f3887ae2-7b2c-462b-8984-e1e6618a0ba6", o.title)) sem.push(o.title); }
console.log("Brunotropolis no estoque (288):", JSON.stringify(cont));
console.log("fora das categorias (amostra):", sem.filter((_, i) => i % Math.ceil(sem.length / 25 || 1) === 0).map((t) => t.slice(0, 50)).join(" | "));

if (process.argv.includes("--gravar")) {
  const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]));
  const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA;
  const alvo: [string, RegrasCampanha][] = [["c6600a9c-dae3-4cff-8924-3ae62e59a248", geek], ["4f0ad7be-c39c-4fe4-ae9a-91cbaebafaa5", geek], ["e57e215a-ea44-4afb-a72d-573d9d7fc027", fraldas], ["f8a639da-e33b-484f-9f83-51e28f342fad", cupons], ["5a6c841c-064d-403d-8fc4-cbc01b9cea2f", enxoval]];
  for (const [id, r] of alvo) {
    const res = await fetch(`https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/campaigns?id=eq.${id}`, { method: "PATCH", headers: { apikey: K, Authorization: `Bearer ${K}`, "content-type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ regras: r }) });
    console.log("gravou", id.slice(0, 8), res.status);
  }
}
void foraDasRegras;
