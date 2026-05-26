import { List } from "lucide-react";

const TABS = ["Todas", "Manual", "Telegram", "WhatsApp", "Auto"];

export default function PublicacoesPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Publicações</h1>
        <p className="text-zinc-500 text-sm mt-1">Ofertas capturadas de todas as fontes</p>
      </div>

      <div className="flex gap-1.5 mb-6 bg-zinc-900/40 border border-zinc-800/70 rounded-full p-1 w-fit">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={
              i === 0
                ? "px-4 py-1.5 text-xs font-medium rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)] transition-all"
                : "px-4 py-1.5 text-xs font-medium rounded-full text-zinc-400 hover:text-white transition-colors"
            }
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="glass rounded-2xl p-12 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
          <List className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
        </div>
        <p className="text-zinc-200 font-medium tracking-tight">Nenhuma oferta capturada ainda</p>
        <p className="text-zinc-500 text-sm mt-1.5">
          As ofertas aparecerão aqui quando chegarem das fontes configuradas
        </p>
      </div>
    </div>
  );
}
