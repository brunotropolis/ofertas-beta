"use client";

import { Check, X, Radio, Cookie, FileDown, MousePointerClick, Store, Smartphone, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

// Manual de métricas — referência de o que cada plataforma entrega (e o que não).
// Estático: é um cartão de consulta, não puxa dados.

const OK = <Check className="w-4 h-4 text-emerald-400 mx-auto" strokeWidth={2.5} />;
const NO = <X className="w-4 h-4 text-red-400/70 mx-auto" strokeWidth={2.5} />;
const PARC = <span className="text-amber-400 text-[11px] font-semibold">parcial</span>;

const TH = "py-2 px-2.5 font-semibold text-zinc-400 border border-zinc-700/60 bg-zinc-900/40";
const TD = "py-2 px-2.5 border border-zinc-800/70";

type Cell = React.ReactNode;
const MATRIX: { dim: string; shopee: Cell; ml: Cell; amazon: Cell; nota?: string }[] = [
  { dim: "Vendas por produto / categoria", shopee: OK, ml: OK, amazon: OK, nota: "Amazon esconde os de baixo volume num 'Outros'" },
  { dim: "Comissão por dia (curva)", shopee: OK, ml: OK, amazon: NO, nota: "Amazon vem agregada por período, não por dia" },
  { dim: "Cliques + conversão clique→venda", shopee: OK, ml: OK, amazon: OK, nota: "Shopee/ML = total da conta; Amazon = por produto" },
  { dim: "Variação vs período anterior", shopee: OK, ml: OK, amazon: PARC, nota: "Amazon só mês a mês (sem janela móvel)" },
  { dim: "Status (pendente/confirmado/cancelado)", shopee: OK, ml: OK, amazon: NO },
  { dim: "Vendedor / loja que vendeu", shopee: NO, ml: OK, amazon: NO, nota: "Exclusivo do Mercado Livre" },
  { dim: "Dispositivo (celular/PC)", shopee: OK, ml: NO, amazon: NO, nota: "Exclusivo da Shopee" },
  { dim: "UTM / origem do clique", shopee: OK, ml: NO, amazon: NO, nota: "Exclusivo da Shopee" },
  { dim: "Anúncios × produto (grupos WhatsApp)", shopee: OK, ml: OK, amazon: OK },
  { dim: "Split de comissão (marketplace/seller/brand)", shopee: NO, ml: OK, amazon: NO, nota: "Exclusivo do Mercado Livre" },
];

const PLATS = [
  {
    key: "shopee", label: "Shopee", dot: "bg-orange-400", acc: "border-l-orange-500", icon: Radio,
    como: "Dois canais: API oficial (GraphQL, ao vivo, no próprio painel) + portal web de afiliados (cookie) pro que a API não dá.",
    fonte: "API oficial + portal web (coletor)",
    puxa: ["Vendas, comissão, GMV, ticket — ao vivo", "Produto e categoria detalhados (100%, nada oculto)", "Status das conversões", "Dispositivo e UTM (só a Shopee)", "Cliques → conversão clique→pedido (portal, janelas 7/30/90)", "Curva por dia e variação"],
    naopuxa: ["Vendedor/loja que fez a venda"],
    gotcha: "A comissão do portal é estimada (inclui pendentes) e pode divergir um pouco da comissão confirmada ao vivo. O portal limita ~30 dias por consulta — o coletor puxa em blocos.",
  },
  {
    key: "ml", label: "Mercado Livre", dot: "bg-yellow-400", acc: "border-l-yellow-500", icon: Cookie,
    como: "Endpoint interno do painel de afiliados (basta o cookie da sua sessão logada). Coletor grava no banco.",
    fonte: "Endpoint interno (cookie) — coletor",
    puxa: ["1 linha por venda: produto, categoria, data, valor, unidades, comissão e %", "Status e tipo de venda", "Vendedor/loja que vendeu (só o ML)", "Cliques → pedidos + split de comissão marketplace/seller/brand (só o ML)", "Curva por dia e variação"],
    naopuxa: ["Dispositivo", "UTM / origem"],
    gotcha: "Os cliques são total da CONTA na janela (não por produto). Os caminhos do painel mudaram (12/Set) — o coletor roda a partir da home do ML.",
  },
  {
    key: "amazon", label: "Amazon", dot: "bg-sky-400", acc: "border-l-sky-500", icon: FileDown,
    como: "Sem API de ganhos. Baixamos o relatório CSV do Associados (Produto relacionado) e importamos. Rodo na mão.",
    fonte: "Relatório CSV do Associados",
    puxa: ["Produtos, categoria, unidades, receita e ganhos", "Cliques POR PRODUTO → conversão clique→compra (só a Amazon dá por produto)", "2 tracking IDs (0c-20 + 04-20), somadas"],
    naopuxa: ["Comissão por dia (vem agregada no período)", "Variação por janela móvel (só mês a mês)", "Status, dispositivo, UTM, vendedor", "Produtos de baixo volume (a Amazon suprime → viram 'Outros')"],
    gotcha: "Agregada por mês (sem por-dia); a janela 7/30/90 entra pro-rata. Relatório limita ~31 dias. Download é manual (CSV).",
  },
] as const;

export default function MetricasClient() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4">
        <h2 className="text-white font-display font-semibold tracking-tight text-[15px]">Manual de Métricas</h2>
        <p className="text-[12px] text-zinc-400 mt-1 leading-snug">
          O que cada plataforma entrega de dados — e o que não dá pra puxar. Cada fonte tem um jeito diferente e um dado exclusivo.
          Consulta rápida pra saber por que um número existe (ou não) em cada aba.
        </p>
      </div>

      {/* Matriz resumo */}
      <div className="glass rounded-xl p-4 border-l-[3px] border-l-zinc-500">
        <h3 className="text-white font-display font-semibold tracking-tight text-sm mb-3">Resumo — o que puxa por plataforma</h3>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-[13px] min-w-[720px] border-collapse">
            <thead><tr>
              <th className={cn(TH, "text-left")}>Dado</th>
              <th className={cn(TH, "text-center")}><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Shopee</span></th>
              <th className={cn(TH, "text-center")}><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />ML</span></th>
              <th className={cn(TH, "text-center")}><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />Amazon</span></th>
              <th className={cn(TH, "text-left")}>Observação</th>
            </tr></thead>
            <tbody>
              {MATRIX.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className={cn(TD, "text-zinc-100")}>{r.dim}</td>
                  <td className={cn(TD, "text-center")}>{r.shopee}</td>
                  <td className={cn(TD, "text-center")}>{r.ml}</td>
                  <td className={cn(TD, "text-center")}>{r.amazon}</td>
                  <td className={cn(TD, "text-zinc-500 text-[11px]")}>{r.nota ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2 flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-400" /> puxa</span>
          <span className="inline-flex items-center gap-1"><X className="w-3.5 h-3.5 text-red-400/70" /> não puxa</span>
          <span className="inline-flex items-center gap-1"><span className="text-amber-400 font-semibold">parcial</span> limitado</span>
        </p>
      </div>

      {/* Cartões por plataforma */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {PLATS.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.key} className={cn("glass rounded-xl p-4 border-l-[3px]", p.acc)}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("w-2.5 h-2.5 rounded-full", p.dot)} />
                <h3 className="text-white font-display font-semibold tracking-tight text-sm">{p.label}</h3>
              </div>
              <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 mb-2"><Icon className="w-3.5 h-3.5" strokeWidth={1.75} /> {p.fonte}</p>
              <p className="text-[12px] text-zinc-300 leading-snug mb-3">{p.como}</p>

              <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-semibold mb-1">Puxa</p>
              <ul className="space-y-1 mb-3">
                {p.puxa.map((x, i) => (
                  <li key={i} className="text-[12px] text-zinc-300 flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" strokeWidth={2.5} /> {x}</li>
                ))}
              </ul>

              <p className="text-[10px] uppercase tracking-wider text-red-400/70 font-semibold mb-1">Não puxa</p>
              <ul className="space-y-1 mb-3">
                {p.naopuxa.map((x, i) => (
                  <li key={i} className="text-[12px] text-zinc-400 flex items-start gap-1.5"><X className="w-3.5 h-3.5 text-red-400/60 shrink-0 mt-0.5" strokeWidth={2.5} /> {x}</li>
                ))}
              </ul>

              <p className="text-[11px] text-zinc-400 leading-snug bg-zinc-900/50 border border-zinc-800/70 rounded-lg px-2.5 py-2">
                <span className="text-zinc-300 font-medium">⚠️ Atenção:</span> {p.gotcha}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-600 flex items-center gap-3 flex-wrap px-1">
        <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3" /> funil de cliques: ML + Amazon + Shopee</span>
        <span className="inline-flex items-center gap-1"><Store className="w-3 h-3" /> vendedor: só ML</span>
        <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> dispositivo e <Tag className="w-3 h-3" /> UTM: só Shopee</span>
      </p>
    </div>
  );
}
