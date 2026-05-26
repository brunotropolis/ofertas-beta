import { Clock } from "lucide-react";

export default function FilaPage() {
  return (
    <div>
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Fila de publicações</h1>
          <p className="text-zinc-500 text-sm mt-1">Ordem de disparo das ofertas</p>
        </div>
        <div className="flex items-center gap-2 px-1 py-1 pl-3 rounded-full bg-zinc-900/60 border border-zinc-800/70">
          <span className="text-xs text-zinc-500">Intervalo</span>
          <select className="bg-zinc-950 border border-zinc-800 text-white text-xs rounded-full pl-3 pr-2 py-1 focus:outline-none focus:border-orange-500/60">
            <option>15 min</option>
            <option>30 min</option>
            <option>45 min</option>
            <option>60 min</option>
          </select>
        </div>
      </div>

      <div className="glass rounded-2xl p-12 text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
          <Clock className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
        </div>
        <p className="text-zinc-200 font-medium tracking-tight">Fila vazia</p>
        <p className="text-zinc-500 text-sm mt-1.5">Adicione ofertas à fila para publicação automática</p>
      </div>
    </div>
  );
}
