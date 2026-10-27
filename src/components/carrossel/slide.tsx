"use client";

// Uma lâmina 4:5 do carrossel. Tamanhos em cqw (relativos à largura da lâmina),
// então a mesma lâmina serve de miniatura e de prévia grande.

import type { TemplateId } from "@/lib/carrossel/templates";
import type { MarcaCarrossel } from "@/lib/carrossel/marcas";
import { fonteMao, fonteTitulo } from "./fonts";

export interface ProdutoSlide {
  nome: string;
  preco: string; // já formatado ("R$ 89,90") ou vazio
  loja: string; // "shopee" | "amazon" | "meli"
  imagem: string | null;
  codigo: string; // "ABC-DEF-GHI"
}

export type SlideKind =
  | { tipo: "capa"; titulo: string; imagem: string | null }
  | { tipo: "produto"; produto: ProdutoSlide; indice: number }
  | { tipo: "cta"; imagem: string | null };

// Paleta de cena de mentira (sem imagem): dá a cara de cada template na miniatura.
const CENA_DEMO: Record<TemplateId, string> = {
  "garimpo-dourado": "radial-gradient(120% 80% at 80% 10%, #ffe2a8 0%, #e9b878 35%, #9c6a3c 75%, #4a2e18 100%)",
  "cantinho-pinterest": "radial-gradient(100% 70% at 30% 20%, #ffd0c2 0%, #e88f8f 40%, #8f3b4f 80%, #3b1d2a 100%)",
  "vitrine-editorial": "linear-gradient(115deg, #3a2a12 0%, #7a5a26 30%, #c8a35a 45%, #6b4c1f 60%, #2b1e0c 100%)",
  "na-mao-codigo": "radial-gradient(110% 80% at 50% 30%, #ffc9d6 0%, #f19ab1 45%, #b4566f 85%, #6e2a3c 100%)",
  "colecao-tematica": "radial-gradient(110% 80% at 50% 20%, #ffe8c7 0%, #f0b58c 35%, #b84a3a 75%, #5c1f1a 100%)",
};

export function Slide({ template, marca, slide }: { template: TemplateId; marca: MarcaCarrossel; slide: SlideKind }) {
  const imagem = slide.tipo === "produto" ? slide.produto.imagem : slide.imagem;
  return (
    <div
      className="relative w-full aspect-[4/5] overflow-hidden rounded-[3%] bg-zinc-900 select-none"
      style={{ containerType: "inline-size" }}
    >
      <Cena template={template} imagem={imagem} />
      {slide.tipo === "capa" && <Capa template={template} marca={marca} titulo={slide.titulo} />}
      {slide.tipo === "produto" && <Etiqueta template={template} marca={marca} p={slide.produto} i={slide.indice} />}
      {slide.tipo === "cta" && <Cta marca={marca} />}
      <span className={`absolute bottom-[2.5cqw] right-[3cqw] text-white/70 ${fonteTitulo.className}`} style={{ fontSize: "2.3cqw" }}>
        {marca.handle}
      </span>
    </div>
  );
}

// Enquanto o renderizador com IA não liga, a "cena" é a própria foto do anúncio:
// fundo = foto ampliada e desfocada, frente = foto inteira.
function Cena({ template, imagem }: { template: TemplateId; imagem: string | null }) {
  if (!imagem) {
    return (
      <div className="absolute inset-0" style={{ background: CENA_DEMO[template] }}>
        <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-[46%] aspect-square rounded-[18%] bg-white/25 backdrop-blur-sm border border-white/40 shadow-[0_8cqw_10cqw_-4cqw_rgba(0,0,0,0.45)]" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagem} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl brightness-75" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imagem} alt="" className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-[78%] h-[62%] object-contain drop-shadow-[0_4cqw_5cqw_rgba(0,0,0,0.45)]" />
    </div>
  );
}

function Estrela({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path fill="currentColor" d="M12 1.5l2.9 7.1 7.6.6-5.8 5 1.8 7.4L12 17.6l-6.5 4 1.8-7.4-5.8-5 7.6-.6z" />
    </svg>
  );
}

function Capa({ template, marca, titulo }: { template: TemplateId; marca: MarcaCarrossel; titulo: string }) {
  const sombra = "0 0.4cqw 2.5cqw rgba(0,0,0,0.45)";
  switch (template) {
    case "garimpo-dourado":
      return (
        <div className="absolute inset-x-[6%] bottom-[10%]">
          <p className={`${fonteTitulo.className} font-bold leading-[0.95] lowercase`} style={{ fontSize: "10cqw", color: marca.destaque, textShadow: sombra, letterSpacing: "-0.03em" }}>
            {titulo}
          </p>
          <Estrela className="absolute -top-[6cqw] right-0" style={{ width: "9cqw", color: marca.destaque }} />
          <Estrela className="absolute -bottom-[6cqw] left-0" style={{ width: "7cqw", color: marca.destaque }} />
        </div>
      );
    case "cantinho-pinterest":
      return (
        <div className="absolute inset-0 flex items-center justify-center px-[22%]">
          <p className={`${fonteTitulo.className} font-semibold text-white text-center leading-[1.15] lowercase`} style={{ fontSize: "5.4cqw", textShadow: sombra }}>
            {titulo}
          </p>
        </div>
      );
    case "vitrine-editorial":
      return (
        <div className="absolute inset-0 flex items-center justify-center px-[10%]">
          <p className={`${fonteTitulo.className} font-bold text-[#fff6e0] text-center leading-[0.98] lowercase`} style={{ fontSize: "9cqw", textShadow: sombra, letterSpacing: "-0.03em" }}>
            {titulo}
          </p>
          <Estrela className="absolute top-[28%] left-[12%] text-white" style={{ width: "4cqw" }} />
          <Estrela className="absolute bottom-[28%] right-[14%] text-white" style={{ width: "4cqw" }} />
        </div>
      );
    case "na-mao-codigo":
      return (
        <div className="absolute inset-x-[6%] top-[7%] text-center">
          <p className={`${fonteMao.className} text-white uppercase leading-[0.9]`} style={{ fontSize: "11cqw", textShadow: sombra }}>
            {titulo}
          </p>
          <Brilhos />
        </div>
      );
    case "colecao-tematica":
      return (
        <div className="absolute inset-x-0 top-[8%] flex justify-center">
          <Arco texto={titulo} tamanho={7} largura={86} />
        </div>
      );
  }
}

function Etiqueta({ template, marca, p, i }: { template: TemplateId; marca: MarcaCarrossel; p: ProdutoSlide; i: number }) {
  const sombra = "0 0.3cqw 1.6cqw rgba(0,0,0,0.55)";
  switch (template) {
    case "garimpo-dourado": {
      // alterna a etiqueta entre os cantos de cima pra não ficar tudo igual
      const lado = i % 2 === 0 ? "left-[8%] items-start" : "right-[8%] items-end text-right";
      return (
        <div className={`absolute top-[9%] flex flex-col ${lado}`} style={{ maxWidth: "52%" }}>
          <span className={`${fonteTitulo.className} font-medium text-white/95 leading-tight`} style={{ fontSize: "3.2cqw", textShadow: sombra }}>{p.nome}</span>
          {p.preco && <span className={`${fonteTitulo.className} font-bold text-white`} style={{ fontSize: "4.6cqw", textShadow: sombra }}>{p.preco}</span>}
          <span className="block bg-white/90" style={{ width: "0.35cqw", height: "12cqw", marginTop: "1cqw" }} />
          <span className="block rounded-full bg-white" style={{ width: "1.6cqw", height: "1.6cqw", marginTop: "-0.4cqw", marginLeft: i % 2 === 0 ? "-0.6cqw" : 0, marginRight: i % 2 === 0 ? 0 : "-0.6cqw" }} />
        </div>
      );
    }
    case "cantinho-pinterest":
      return (
        <div className="absolute top-[30%] right-[12%] flex flex-col" style={{ maxWidth: "48%" }}>
          <span className={`${fonteTitulo.className} font-medium text-white leading-tight`} style={{ fontSize: "2.9cqw", textShadow: sombra }}>{p.nome}</span>
          {p.preco && <span className={`${fonteTitulo.className} font-semibold text-white`} style={{ fontSize: "2.9cqw", textShadow: sombra }}>{p.preco}</span>}
          <span className="block bg-white/90" style={{ width: "0.3cqw", height: "6cqw", marginTop: "0.8cqw" }} />
        </div>
      );
    case "vitrine-editorial":
      return (
        <div className={`absolute ${i % 2 === 0 ? "bottom-[16%] left-[8%]" : "top-[12%] right-[8%] text-right"}`} style={{ maxWidth: "70%" }}>
          <p className={`${fonteTitulo.className} font-bold text-[#fff6e0] leading-[0.95] lowercase`} style={{ fontSize: "8.5cqw", textShadow: sombra, letterSpacing: "-0.03em" }}>{p.nome}</p>
          <p className={`${fonteTitulo.className} font-medium text-white/85 mt-[1cqw]`} style={{ fontSize: "2.6cqw", textShadow: sombra }}>
            {p.loja}{p.preco ? ` | ${p.preco}` : ""}
          </p>
        </div>
      );
    case "na-mao-codigo":
      return (
        <div className="absolute inset-x-[5%] top-[6%] flex flex-col items-center text-center">
          <p className={`${fonteMao.className} text-white uppercase leading-[0.92]`} style={{ fontSize: "10cqw", textShadow: sombra }}>{p.nome}</p>
          <span className={`${fonteTitulo.className} font-semibold text-white rounded-full mt-[1.5cqw]`} style={{ fontSize: "3cqw", padding: "0.8cqw 3cqw", background: "#e8708f" }}>
            id {p.codigo}
          </span>
          <Brilhos />
        </div>
      );
    case "colecao-tematica":
      return (
        <div className="absolute inset-x-0 top-[13%] flex justify-center">
          <Arco texto={p.nome} tamanho={5} largura={64} />
        </div>
      );
  }
}

function Cta({ marca }: { marca: MarcaCarrossel }) {
  return (
    <div className="absolute inset-x-[8%] top-[10%] text-center">
      <p className={`${fonteTitulo.className} font-semibold text-white leading-tight`} style={{ fontSize: "5.6cqw", textShadow: "0 0.4cqw 2cqw rgba(0,0,0,0.5)" }}>
        Gostou? comente &ldquo;{marca.palavraCta}&rdquo;
        <br />
        que te envio os links!
      </p>
    </div>
  );
}

// Título em arco (Coleção Temática): texto num caminho SVG curvado.
function Arco({ texto, tamanho, largura }: { texto: string; tamanho: number; largura: number }) {
  const id = `arco-${texto.length}-${tamanho}`;
  // o arco tem ~110 unidades; letra média ~0,62 do corpo, com folga → encolhe título longo pra não cortar
  const corpo = Math.min(tamanho * 1.15, 74 / (Math.max(texto.length, 1) * 0.62));
  return (
    <svg viewBox="0 0 100 30" style={{ width: `${largura}cqw`, overflow: "visible" }} aria-label={texto}>
      <path id={id} d="M 4 26 Q 50 -6 96 26" fill="none" />
      <text className={fonteTitulo.className} fill="#fff" fontWeight={600} fontSize={corpo} textAnchor="middle" style={{ filter: "drop-shadow(0 0.4px 1.2px rgba(0,0,0,0.6))" }}>
        <textPath href={`#${id}`} startOffset="50%">{texto}</textPath>
      </text>
    </svg>
  );
}

function Brilhos() {
  const pos = [
    { l: "4%", t: "4%", s: 3.6 },
    { l: "90%", t: "10%", s: 3 },
    { l: "10%", t: "70%", s: 2.6 },
    { l: "86%", t: "62%", s: 3.4 },
  ];
  return (
    <>
      {pos.map((p, k) => (
        <Estrela key={k} className="absolute text-[#fff3b0]" style={{ left: p.l, top: p.t, width: `${p.s}cqw` }} />
      ))}
    </>
  );
}
