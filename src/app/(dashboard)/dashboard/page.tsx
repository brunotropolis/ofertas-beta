import { LayoutDashboard } from "lucide-react";

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Métricas e visão geral do sistema</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <LayoutDashboard className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">Dashboard em construção.</p>
        <p className="text-gray-500 text-sm mt-1">Métricas de publicações, taxa de sucesso e performance por campanha.</p>
      </div>
    </div>
  );
}
