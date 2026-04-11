import { Clock } from "lucide-react";

export default function FilaPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Fila de Publicações</h1>
          <p className="text-gray-400 text-sm mt-1">Ordem de disparo das ofertas</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Intervalo:</span>
          <select className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-1.5">
            <option>15 min</option>
            <option>30 min</option>
            <option>45 min</option>
            <option>60 min</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Fila vazia.</p>
        <p className="text-gray-500 text-sm mt-1">Adicione ofertas à fila para publicação automática.</p>
      </div>
    </div>
  );
}
