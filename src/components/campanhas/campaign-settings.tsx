"use client";

import { useEffect, useState } from "react";
import { Settings2, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

// Colunas do trickle automático (migration 20260918_auto_enqueue) — fora dos tipos gerados.
type AutoFields = {
  auto_enqueue: boolean;
  auto_daily_cap: number;
  auto_window_start: number;
  auto_window_end: number;
  auto_buffer: number;
};

export type CampaignSettingsData = {
  name: string;
  niche: string;
  timer_minutes: number;
  ai_prompt: string;
  is_active: boolean;
} & AutoFields;

const TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

function fromCampaign(c: Campaign): CampaignSettingsData {
  const a = c as unknown as Partial<AutoFields>;
  return {
    name: c.name,
    niche: c.niche ?? "",
    timer_minutes: c.timer_minutes,
    ai_prompt: c.ai_prompt ?? "",
    is_active: c.is_active,
    auto_enqueue: a.auto_enqueue ?? false,
    auto_daily_cap: a.auto_daily_cap ?? 10,
    auto_window_start: a.auto_window_start ?? 8,
    auto_window_end: a.auto_window_end ?? 21,
    auto_buffer: a.auto_buffer ?? 6,
  };
}

/**
 * Todas as configurações da campanha abertas na tela (o que antes ficava escondido no lápis),
 * incluindo a postagem automática. Salva via PATCH /api/campanhas/[id].
 */
export default function CampaignSettings({
  campaign,
  onSaved,
  onDelete,
}: {
  campaign: Campaign;
  onSaved: (updated: Campaign) => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<CampaignSettingsData>(() => fromCampaign(campaign));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setForm(fromCampaign(campaign)); }, [campaign]);

  const original = fromCampaign(campaign);
  const dirty = JSON.stringify(original) !== JSON.stringify(form);
  const set = <K extends keyof CampaignSettingsData>(k: K, v: CampaignSettingsData[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const windowHours = Math.max(0, form.auto_window_end - form.auto_window_start);
  const maxByTimer = Math.floor((windowHours * 60) / Math.max(form.timer_minutes, 1));

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/campanhas/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: err.error || `Erro ${res.status} ao salvar` });
      return;
    }
    onSaved(await res.json());
    setMsg({ ok: true, text: "✓ Salvo" });
    setTimeout(() => setMsg(null), 2500);
  }

  return (
    <div className="glass rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h3 className="flex items-center gap-2 text-white font-display font-semibold tracking-tight">
          <Settings2 className="w-4 h-4 text-orange-400" strokeWidth={1.75} /> Configurações da campanha
        </h3>
        <div className="flex items-center gap-2">
          {msg && <span className={cn("text-xs", msg.ok ? "text-emerald-400" : "text-red-400")}>{msg.text}</span>}
          {dirty && (
            <button
              onClick={() => setForm(original)}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white rounded-full border border-zinc-800"
            >
              Descartar
            </button>
          )}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-1.5 text-xs font-medium text-white rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-40 glow-orange-sm"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna 1: básico */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome da campanha">
              <input className="cfg-input" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Nicho">
              <input className="cfg-input" value={form.niche} placeholder="bebê, geek..." onChange={(e) => set("niche", e.target.value)} />
            </Field>
          </div>

          <Field label="Intervalo entre disparos">
            <div className="flex gap-1.5 flex-wrap">
              {TIMER_OPTIONS.map((t) => (
                <Chip key={t} active={form.timer_minutes === t} onClick={() => set("timer_minutes", t)}>{t}min</Chip>
              ))}
            </div>
          </Field>

          <ToggleRow
            label="Campanha ativa"
            hint="Desligada = nada desta campanha é postado (nem manual nem automático)."
            value={form.is_active}
            onChange={(v) => set("is_active", v)}
          />

          <Field label="Prompt da IA (legenda)">
            <textarea
              className="cfg-input resize-y min-h-[180px] font-mono text-[12.5px] leading-relaxed"
              value={form.ai_prompt}
              onChange={(e) => set("ai_prompt", e.target.value)}
              placeholder="Instruções para a IA gerar a legenda das ofertas desta campanha..."
            />
          </Field>
        </div>

        {/* Coluna 2: postagem automática */}
        <div className="space-y-4">
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-4 space-y-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-orange-300">
              <Zap className="w-4 h-4" strokeWidth={1.75} /> Postagem automática
            </p>
            <ToggleRow
              label="Enfileirar ofertas sozinho"
              hint="Pega a oferta mais nova coletada do perfil (com foto e link) e põe na fila."
              value={form.auto_enqueue}
              onChange={(v) => set("auto_enqueue", v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Teto por dia">
                <input type="number" min={0} max={500} className="cfg-input" value={form.auto_daily_cap}
                  onChange={(e) => set("auto_daily_cap", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Pré-carregados na fila">
                <input type="number" min={0} max={50} className="cfg-input" value={form.auto_buffer}
                  onChange={(e) => set("auto_buffer", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Começa às (BRT)">
                <HourSelect value={form.auto_window_start} min={0} max={23} onChange={(v) => set("auto_window_start", v)} />
              </Field>
              <Field label="Termina às (BRT)">
                <HourSelect value={form.auto_window_end} min={1} max={24} onChange={(v) => set("auto_window_end", v)} />
              </Field>
            </div>
            <p className="text-[11.5px] text-zinc-400 leading-relaxed">
              Janela de {windowHours}h com 1 post a cada {form.timer_minutes}min cabe até <b className="text-zinc-200">{maxByTimer}</b> posts/dia.
              {" "}O teto atual é <b className="text-zinc-200">{form.auto_daily_cap}</b>
              {form.auto_daily_cap < maxByTimer ? " (o teto é que limita)." : " (o intervalo é que limita)."}
              {" "}Posts manuais não contam no teto.
            </p>
          </div>

          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} /> Excluir campanha
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        :global(.cfg-input) {
          width: 100%;
          background: rgba(24, 24, 27, 0.7);
          border: 1px solid rgb(39 39 42);
          border-radius: 0.75rem;
          padding: 0.55rem 0.8rem;
          color: rgb(244 244 245);
          font-size: 0.875rem;
        }
        :global(.cfg-input:focus) {
          outline: none;
          border-color: rgb(255 107 53 / 0.6);
          box-shadow: 0 0 0 3px rgb(255 107 53 / 0.12);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
        active
          ? "bg-orange-500 text-white shadow-[0_0_12px_rgba(255,107,53,0.4)]"
          : "bg-zinc-900/70 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
      )}
    >
      {children}
    </button>
  );
}

function HourSelect({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const opts: number[] = [];
  for (let h = min; h <= max; h++) opts.push(h);
  return (
    <select className="cfg-input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {opts.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
    </select>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-zinc-200 tracking-tight">{label}</p>
        {hint && <p className="text-[11.5px] text-zinc-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors shrink-0",
          value ? "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "bg-zinc-800"
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform", value && "translate-x-5")} />
      </button>
    </div>
  );
}
