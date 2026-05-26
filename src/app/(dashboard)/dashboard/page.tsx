import { LayoutDashboard, TrendingUp, Send, Megaphone, Activity } from "lucide-react";

const STATS = [
  { label: "Publicações hoje",  value: "—", icon: Send,       hint: "últimas 24h" },
  { label: "Taxa de sucesso",   value: "—", icon: TrendingUp, hint: "envios OK" },
  { label: "Campanhas ativas",  value: "—", icon: Megaphone,  hint: "rodando agora" },
  { label: "Conexões",          value: "—", icon: Activity,   hint: "WhatsApp online" },
];

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Métricas e visão geral do sistema</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {STATS.map(({ label, value, icon: Icon, hint }) => (
          <div key={label} className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="h-8 w-8 rounded-xl bg-zinc-900/80 border border-zinc-800/70 flex items-center justify-center">
                <Icon className="w-4 h-4 text-orange-400" strokeWidth={1.75} />
              </span>
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">{hint}</span>
            </div>
            <p className="text-3xl font-display font-semibold text-white tracking-tightest">{value}</p>
            <p className="text-[11px] text-zinc-500 mt-1 tracking-tight">{label}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-12 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
          <LayoutDashboard className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
        </div>
        <p className="text-zinc-200 font-medium tracking-tight">Dashboard em construção</p>
        <p className="text-zinc-500 text-sm mt-1.5">
          Métricas de publicações, taxa de sucesso e performance por campanha
        </p>
      </div>
    </div>
  );
}
