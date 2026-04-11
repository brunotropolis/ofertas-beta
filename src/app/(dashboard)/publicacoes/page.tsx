import { List } from "lucide-react";

export default function PublicacoesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Lista de Publicações</h1>
        <p className="text-gray-400 text-sm mt-1">Ofertas capturadas de todas as fontes</p>
      </div>

      <div className="flex gap-2 mb-6">
        {["Todas", "Manual", "Telegram", "WhatsApp", "Auto"].map((tab) => (
          <button
            key={tab}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors first:bg-blue-600 first:text-white"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <List className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Nenhuma oferta capturada ainda.</p>
        <p className="text-gray-500 text-sm mt-1">As ofertas aparecerão aqui quando chegarem das fontes configuradas.</p>
      </div>
    </div>
  );
}
