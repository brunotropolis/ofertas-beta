import { Tag } from "lucide-react";

export default function OfertasPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Ofertas</h1>
          <p className="text-gray-400 text-sm mt-1">Curadoria e publicação de ofertas</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Tag className="w-4 h-4" />
          Nova Oferta
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <Tag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Nenhuma oferta disponível.</p>
        <p className="text-gray-500 text-sm mt-1">Adicione uma URL de produto para começar.</p>
      </div>
    </div>
  );
}
