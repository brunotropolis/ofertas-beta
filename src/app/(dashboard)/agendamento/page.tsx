import { CalendarClock } from "lucide-react";

export default function AgendamentoPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agendamento</h1>
          <p className="text-gray-400 text-sm mt-1">Posts agendados: avisos, convites e promoções</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <CalendarClock className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <CalendarClock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Nenhum post agendado.</p>
        <p className="text-gray-500 text-sm mt-1">Agende posts únicos, diários ou semanais para suas campanhas.</p>
      </div>
    </div>
  );
}
