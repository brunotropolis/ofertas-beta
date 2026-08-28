"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="glass rounded-2xl w-full max-w-lg shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/70">
          <h2 className="text-white font-display font-semibold tracking-tight">
            {campaign ? "Editar campanha" : "Nova campanha"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <Field label="Nome da campanha" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Ofertas Geek Maternas"
              className="modal-input"
            />
          </Field>

          <Field label="Nicho">
            <input
              type="text"
              value={form.niche}
              onChange={(e) => setForm((p) => ({ ...p, niche: e.target.value }))}
              placeholder="geek, bebê, casa, eletrônicos..."
              className="modal-input"
            />
          </Field>

          <Field label="Intervalo entre disparos">
            <div className="flex gap-1.5 flex-wrap">
              {TIMER_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, timer_minutes: t }))}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all",
                    form.timer_minutes === t
                      ? "bg-orange-500 text-white shadow-[0_0_12px_rgba(255,107,53,0.4)]"
                      : "bg-zinc-900/70 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200"
                  )}
                >
                  {t}min
                </button>
              ))}
            </div>
          </Field>

          <Field label="Prompt da IA">
            <textarea
              value={form.ai_prompt}
              onChange={(e) => setForm((p) => ({ ...p, ai_prompt: e.target.value }))}
              rows={4}
              placeholder="Instruções para a IA gerar a legenda das ofertas desta campanha..."
              className="modal-input resize-none"
            />
          </Field>

          <div className="flex items-center justify-between pt-1">
            <label className="text-sm text-zinc-300 tracking-tight">Campanha ativa</label>
            <button
              type="button"
              onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                form.is_active
                  ? "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_12px_rgba(255,107,53,0.35)]"
                  : "bg-zinc-800"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                  form.is_active && "translate-x-5"
                )}
              />
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-60 text-white text-sm rounded-xl transition-all font-medium glow-orange-sm"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        :global(.modal-input) {
          width: 100%;
          background: rgba(24, 24, 27, 0.7);
          border: 1px solid rgb(39 39 42);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          color: rgb(244 244 245);
          font-size: 0.875rem;
          transition: all 0.15s;
        }
        :global(.modal-input::placeholder) {
          color: rgb(82 82 91);
        }
        :global(.modal-input:focus) {
          outline: none;
          border-color: rgb(255 107 53 / 0.6);
          box-shadow: 0 0 0 3px rgb(255 107 53 / 0.12);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-1.5">
        {label}
        {required && <span className="text-orange-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
