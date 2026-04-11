import { Calendar } from "lucide-react";

export default function CalendarioPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Calendário</h1>
        <p className="text-gray-400 text-sm mt-1">Visão mensal de publicações e agendamentos</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Calendário em construção.</p>
        <p className="text-gray-500 text-sm mt-1">Veja todas as publicações e agendamentos em uma timeline mensal.</p>
      </div>
    </div>
  );
}
