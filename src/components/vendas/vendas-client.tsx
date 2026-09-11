"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet, ShoppingBag, Package, Receipt, RefreshCw, Loader2,
  AlertTriangle, TrendingUp, Tag, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Agg {
  kpis: {
    commission: number; conversions: number; items: number; gmv: number; ticket: number;
    byStatusCount: Record<string, number>;
    byStatusCommission: Record<string, number>;
  };
  byProduct: { name: string; image: string | null; qty: number; commission: number; gmv: number }[];
  byDay: { day: string; commission: number; conversions: number }[];
  byUtm: { utm: string; commission: number; conversions: number }[];
  byDevice: { device: string; commission: number; conversions: number }[];
}
interface VendasResp {
  period: { days: number };
  shopee: { ok: boolean; error?: string; agg?: Agg };
}

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: "Pendente",   cls: "bg-amber-500/10 text-amber-400" },
  CONFIRMED: { label: "Confirmada", cls: "bg-emerald-500/10 text-emerald-400" },
  PAID:      { label: "Paga",       cls: "bg-emerald-500/10 text-emerald-400" },
  CANCELLED: { label: "Cancelada",  cls: "bg-red-500/10 text-red-400" },
  UNKNOWN:   { label: "Outro",      cls: "bg-zinc-800 text-zinc-400" },
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number) => n.toLocaleString("pt-BR");

export default function VendasClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<VendasResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/vendas?days=${days}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const agg = data?.shopee.agg;
  const err = data?.shopee.ok === false ? data.shopee.error : null;
  const maxDay = agg ? Math.max(1, ...agg.byDay.map((d) => d.commission)) : 1;

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Vendas</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Resultados de afiliado — comissões, produtos e UTMs. <span className="text-orange-400">Fonte: Shopee</span> (Amazon em breve).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  "px-3.5 py-1.5 text-xs font-medium rounded-full transition-all",
                  days === p.days
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} strokeWidth={1.75} />
            Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" />
          <p className="text-zinc-500 text-sm mt-3">Puxando conversões da Shopee...</p>
        </div>
      ) : err ? (
        <div className="glass rounded-2xl p-8 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
            <AlertTriangle className="w-7 h-7 text-red-400" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Não deu pra puxar as vendas</p>
          <p className="text-red-400 text-sm mt-1.5">{err}</p>
        </div>
      ) : !agg ? null : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={Wallet}     label="Comissão"   value={brl(agg.kpis.commission)} highlight />
            <Kpi icon={ShoppingBag} label="Conversões" value={num(agg.kpis.conversions)} />
            <Kpi icon={Package}    label="Itens"      value={num(agg.kpis.items)} />
            <Kpi icon={TrendingUp} label="GMV"        value={brl(agg.kpis.gmv)} />
            <Kpi icon={Receipt}    label="Ticket méd."value={brl(agg.kpis.ticket)} />
          </div>

          {/* Status */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-3">Status das conversões</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(agg.kpis.byStatusCount).map(([st, count]) => {
                const meta = STATUS_META[st] ?? STATUS_META.UNKNOWN;
                return (
                  <div key={st} className={cn("rounded-xl px-3 py-2 text-xs", meta.cls)}>
                    <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
                    <span className="mx-1.5 opacity-60">·</span>
                    {num(count)} venda{count !== 1 ? "s" : ""}
                    <span className="mx-1.5 opacity-60">·</span>
                    {brl(agg.kpis.byStatusCommission[st] ?? 0)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline por dia */}
          {agg.byDay.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4">Comissão por dia</h2>
              <div className="flex items-end gap-1 h-36 overflow-x-auto scroll-thin pb-1">
                {agg.byDay.map((d) => (
                  <div key={d.day} className="flex flex-col items-center gap-1 min-w-[26px] group">
                    <div className="flex-1 flex items-end w-full">
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-orange-600 to-orange-400 transition-all group-hover:from-orange-500 group-hover:to-orange-300"
                        style={{ height: `${Math.max(4, (d.commission / maxDay) * 100)}%` }}
                        title={`${d.day}: ${brl(d.commission)} · ${d.conversions} vendas`}
                      />
                    </div>
                    <span className="text-[9px] text-zinc-600 rotate-0 whitespace-nowrap">
                      {d.day.slice(8, 10)}/{d.day.slice(5, 7)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* Top produtos */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
                Produtos mais vendidos
              </h2>
              <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-thin">
                {agg.byProduct.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-2.5">
                    {p.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={p.image} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-zinc-900"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-zinc-900 shrink-0 grid place-items-center">
                        <Package className="w-5 h-5 text-zinc-700" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm tracking-tight truncate">{p.name}</p>
                      <p className="text-[11px] text-zinc-500">{num(p.qty)} un · GMV {brl(p.gmv)}</p>
                    </div>
                    <span className="text-emerald-400 font-semibold text-sm shrink-0">{brl(p.commission)}</span>
                  </div>
                ))}
                {agg.byProduct.length === 0 && <p className="text-zinc-500 text-sm">Nenhuma venda no período.</p>}
              </div>
            </div>

            <div className="space-y-5">
              {/* UTMs */}
              <div className="glass rounded-2xl p-5">
                <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
                  Vendas por UTM
                </h2>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto scroll-thin">
                  {agg.byUtm.map((u, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm px-1">
                      <span className="text-zinc-300 truncate font-mono text-xs">{u.utm}</span>
                      <span className="text-zinc-500 text-xs shrink-0">
                        {num(u.conversions)}× · <span className="text-emerald-400 font-medium">{brl(u.commission)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Device */}
              <div className="glass rounded-2xl p-5">
                <h2 className="text-white font-display font-semibold tracking-tight text-sm mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
                  Por dispositivo
                </h2>
                <div className="flex flex-wrap gap-2">
                  {agg.byDevice.map((d) => (
                    <div key={d.device} className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs">
                      <span className="text-zinc-300 font-medium">{d.device}</span>
                      <span className="mx-1.5 text-zinc-600">·</span>
                      <span className="text-zinc-500">{num(d.conversions)}×</span>
                      <span className="mx-1.5 text-zinc-600">·</span>
                      <span className="text-emerald-400">{brl(d.commission)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-zinc-600 text-center">
            Comissões da Shopee ainda pendentes de confirmação podem mudar de status. Amazon entra na próxima rodada.
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, highlight,
}: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("glass rounded-2xl p-4", highlight && "border-orange-500/30")}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "h-7 w-7 rounded-lg grid place-items-center border",
          highlight ? "bg-orange-500/15 border-orange-500/30" : "bg-zinc-900/80 border-zinc-800/70"
        )}>
          <Icon className={cn("w-3.5 h-3.5", highlight ? "text-orange-400" : "text-zinc-400")} strokeWidth={1.75} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-display font-semibold text-white tracking-tightest">{value}</p>
    </div>
  );
}
