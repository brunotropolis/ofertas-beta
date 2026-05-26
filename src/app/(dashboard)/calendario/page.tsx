import { CalendarDays } from "lucide-react";

export default function CalendarioPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Calendário</h1>
        <p className="text-zinc-500 text-sm mt-1">Visão mensal de publicações e agendamentos</p>
      </div>

      <div className="glass rounded-2xl p-12 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
          <CalendarDays className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
        </div>
        <p className="text-zinc-200 font-medium tracking-tight">Calendário em construção</p>
        <p className="text-zinc-500 text-sm mt-1.5">Veja todas as publicações e agendamentos em uma timeline mensal</p>
      </div>
    </div>
  );
}
