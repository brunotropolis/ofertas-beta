import { Megaphone } from "lucide-react";

export default function CampanhasPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campanhas</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie suas campanhas de divulgação</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Megaphone className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <Megaphone className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Nenhuma campanha criada ainda.</p>
        <p className="text-gray-500 text-sm mt-1">Crie sua primeira campanha para começar a publicar ofertas.</p>
      </div>
    </div>
  );
}
