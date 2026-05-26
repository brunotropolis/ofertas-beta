import { CalendarClock, Plus } from "lucide-react";

export default function AgendamentoPage() {
  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Agendamento</h1>
          <p className="text-zinc-500 text-sm mt-1">Posts agendados: avisos, convites e promoções</p>
        </div>
        <button className="flex items-center gap-2 pl-3 pr-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-sm font-medium rounded-full transition-all glow-orange-sm">
          <Plus className="w-4 h-4" strokeWidth={2} />
          Novo agendamento
        </button>
      </div>

      <div className="glass rounded-2xl p-12 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
          <CalendarClock className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
        </div>
        <p className="text-zinc-200 font-medium tracking-tight">Nenhum post agendado</p>
        <p className="text-zinc-500 text-sm mt-1.5">Agende posts únicos, diários ou semanais para suas campanhas</p>
      </div>
    </div>
  );
}
