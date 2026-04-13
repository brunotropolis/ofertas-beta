"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Database } from "@/lib/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

export interface CampaignFormData {
  name: string;
  niche: string;
  timer_minutes: number;
  ai_prompt: string;
  is_active: boolean;
}

interface Props {
  campaign: Campaign | null;
  onSave: (data: CampaignFormData) => Promise<void>;
  onClose: () => void;
}

const TIMER_OPTIONS = [5, 10, 15, 30, 45, 60];

export default function CampaignModal({ campaign, onSave, onClose }: Props) {
  const [form, setForm] = useState<CampaignFormData>({
    name: campaign?.name ?? "",
    niche: campaign?.niche ?? "",
    timer_minutes: campaign?.timer_minutes ?? 15,
    ai_prompt: campaign?.ai_prompt ?? "",
    is_active: campaign?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave(form);
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">
            {campaign ? "Editar Campanha" : "Nova Campanha"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Nome da campanha *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Ofertas Geek Maternas"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Nicho</label>
            <input
              type="text"
              value={form.niche}
              onChange={(e) => setForm((p) => ({ ...p, niche: e.target.value }))}
              placeholder="geek, bebê, casa, eletrônicos..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Intervalo entre disparos</label>
            <div className="flex gap-2 flex-wrap">
              {TIMER_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, timer_minutes: t }))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    form.timer_minutes === t
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {t}min
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Prompt IA</label>
            <textarea
              value={form.ai_prompt}
              onChange={(e) => setForm((p) => ({ ...p, ai_prompt: e.target.value }))}
              rows={4}
              placeholder="Instruções para a IA gerar a legenda das ofertas desta campanha..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Campanha ativa</label>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.is_active ? "bg-blue-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.is_active ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
