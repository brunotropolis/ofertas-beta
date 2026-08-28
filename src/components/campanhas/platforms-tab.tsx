"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Loader2, CheckCircle2, XCircle, Save, Zap, KeyRound, Tag as TagIcon,
} from "lucide-react";

interface MaskedPlatform {
  platform: "amazon" | "shopee" | "ml";
  has_api_key: boolean;
  has_api_secret: boolean;
  has_cookie: boolean;
  tag: string | null;
  keywords: string[];
  categories: string[];
  is_active: boolean;
  cookie_expires_at: string | null;
}

type PlatformKey = "amazon" | "shopee" | "ml";

// Definição de campos por plataforma
const PLATFORMS: Record<
  PlatformKey,
  {
    label: string;
    color: string;
    fields: { key: "api_key" | "api_secret" | "cookie" | "tag"; label: string; secret: boolean; placeholder: string; textarea?: boolean }[];
  }
> = {
  amazon: {
    label: "Amazon",
    color: "#ff9900",
    fields: [
      { key: "api_key", label: "Access Key", secret: true, placeholder: "amzn1.application-oa2-client..." },
      { key: "api_secret", label: "Secret Key", secret: true, placeholder: "amzn1.oa2-cs.v1..." },
      { key: "tag", label: "Partner Tag", secret: false, placeholder: "manualdorec0c-20" },
    ],
  },
  shopee: {
    label: "Shopee",
    color: "#ee4d2d",
    fields: [
      { key: "api_key", label: "App ID", secret: true, placeholder: "18300000000" },
      { key: "api_secret", label: "App Secret", secret: true, placeholder: "chave secreta do app" },
    ],
  },
  ml: {
    label: "Mercado Livre",
    color: "#ffe600",
    fields: [
      { key: "cookie", label: "Cookie de sessão", secret: true, placeholder: "cole o Cookie header do ML...", textarea: true },
      { key: "tag", label: "Tag de afiliado", secret: false, placeholder: "BRUNOTROPOLIS" },
    ],
  },
};

const ORDER: PlatformKey[] = ["ml", "amazon", "shopee"];

export default function PlatformsTab({ campaignId }: { campaignId: string }) {
  const [masked, setMasked] = useState<Record<string, MaskedPlatform>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/campanhas/${campaignId}/platforms`, { cache: "no-store" });
    if (res.ok) {
      const arr: MaskedPlatform[] = await res.json();
      const map: Record<string, MaskedPlatform> = {};
      arr.forEach((p) => { map[p.platform] = p; });
      setMasked(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <Loader2 className="w-6 h-6 mx-auto text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-zinc-500 text-sm">
        Credenciais de afiliado desta campanha. Os segredos são criptografados no banco — depois de salvos aparecem como <span className="text-zinc-300">••••</span>.
      </p>
      {ORDER.map((key) => (
        <PlatformCard
          key={key}
          campaignId={campaignId}
          platform={key}
          masked={masked[key]}
          onSaved={load}
        />
      ))}
    </div>
  );
}

function PlatformCard({
  campaignId,
  platform,
  masked,
  onSaved,
}: {
  campaignId: string;
  platform: PlatformKey;
  masked?: MaskedPlatform;
  onSaved: () => void;
}) {
  const def = PLATFORMS[platform];
  const [values, setValues] = useState<Record<string, string>>({});
  const [keywords, setKeywords] = useState(masked?.keywords?.join(", ") ?? "");
  const [isActive, setIsActive] = useState(masked?.is_active ?? false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  function hasFlag(fieldKey: string): boolean {
    if (!masked) return false;
    if (fieldKey === "api_key") return masked.has_api_key;
    if (fieldKey === "api_secret") return masked.has_api_secret;
    if (fieldKey === "cookie") return masked.has_cookie;
    if (fieldKey === "tag") return !!masked.tag;
    return false;
  }

  async function handleSave() {
    setSaving(true);
    setTestResult(null);
    // Só envia segredos que o usuário digitou (não sobrescreve com vazio)
    const body: Record<string, unknown> = {
      platform,
      is_active: isActive,
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
    };
    for (const f of def.fields) {
      const v = values[f.key];
      if (v !== undefined && v !== "") body[f.key] = v;
      // tag não-secreta: manda mesmo vazio pra permitir edição direta
      if (f.key === "tag" && v !== undefined) body.tag = v;
    }
    const res = await fetch(`/api/campanhas/${campaignId}/platforms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setValues({});
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved();
    } else {
      const err = await res.json().catch(() => ({}));
      setTestResult({ ok: false, message: err.error || "Erro ao salvar" });
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`/api/campanhas/${campaignId}/platforms/${platform}/test`, { method: "POST" });
    const data = await res.json().catch(() => ({ ok: false, message: "erro" }));
    setTestResult({ ok: !!data.ok, message: data.message || (data.ok ? "OK" : "Falhou") });
    setTesting(false);
  }

  const configured = masked && (masked.has_api_key || masked.has_cookie);

  return (
    <div className="glass rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${def.color}22` }}
          >
            <ShoppingCart className="w-4 h-4" strokeWidth={1.75} style={{ color: def.color }} />
          </span>
          <div>
            <h3 className="text-white font-display font-semibold tracking-tight text-sm">{def.label}</h3>
            {configured && (
              <span className="text-[11px] text-emerald-400">● configurado</span>
            )}
          </div>
        </div>
        {/* Toggle ativo */}
        <button
          onClick={() => setIsActive((v) => !v)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors shrink-0",
            isActive ? "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_12px_rgba(255,107,53,0.35)]" : "bg-zinc-800"
          )}
          title={isActive ? "Ativa no coletor" : "Inativa"}
        >
          <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform", isActive && "translate-x-5")} />
        </button>
      </div>

      {/* Campos */}
      <div className="space-y-3">
        {def.fields.map((f) => (
          <div key={f.key}>
            <label className="text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
              {f.secret ? <KeyRound className="w-3 h-3" /> : <TagIcon className="w-3 h-3" />}
              {f.label}
              {hasFlag(f.key) && <span className="text-emerald-400 normal-case tracking-normal">• salvo</span>}
            </label>
            {f.textarea ? (
              <textarea
                value={values[f.key] ?? (f.key === "tag" ? masked?.tag ?? "" : "")}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                rows={3}
                placeholder={hasFlag(f.key) ? "•••••••• (deixe em branco pra manter)" : f.placeholder}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition resize-none font-mono text-xs"
              />
            ) : (
              <input
                type={f.secret ? "password" : "text"}
                value={values[f.key] ?? (f.key === "tag" ? masked?.tag ?? "" : "")}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={hasFlag(f.key) && f.secret ? "•••••••• (deixe em branco pra manter)" : f.placeholder}
                autoComplete="off"
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition"
              />
            )}
          </div>
        ))}

        {/* Keywords do coletor */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-medium text-zinc-500 mb-1.5 block">
            Palavras-chave do coletor
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="funko, lego, headset gamer, mousepad..."
            className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition"
          />
          <p className="text-[11px] text-zinc-600 mt-1">Separe por vírgula. O coletor busca ofertas por essas palavras.</p>
        </div>
      </div>

      {/* Resultado do teste */}
      {testResult && (
        <div className={cn(
          "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
          testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <XCircle className="w-4 h-4 shrink-0 mt-px" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-white text-sm rounded-full transition-all font-medium disabled:opacity-50",
            savedFlash ? "bg-emerald-600" : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 glow-orange-sm"
          )}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" strokeWidth={2} />}
          {savedFlash ? "Salvo!" : "Salvar"}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !configured}
          className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm rounded-full transition-colors disabled:opacity-40"
          title={!configured ? "Salve as credenciais primeiro" : "Testar conexão"}
        >
          {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" strokeWidth={1.75} />}
          Testar conexão
        </button>
      </div>
    </div>
  );
}
