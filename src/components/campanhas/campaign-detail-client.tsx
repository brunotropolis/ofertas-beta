"use client";

import { useState } from "react";
import { Phone, Users, Bot, ToggleRight, ToggleLeft, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import PhonesTab from "./phones-tab";
import GroupsTab from "./groups-tab";
import CampaignModal, { type CampaignFormData } from "./campaign-modal";
import type { Database } from "@/lib/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type CampaignPhone = Database["public"]["Tables"]["campaign_phones"]["Row"];
type CampaignGroup = Database["public"]["Tables"]["campaign_groups"]["Row"];

interface Props {
  campaign: Campaign;
  initialPhones: CampaignPhone[];
  initialGroups: CampaignGroup[];
}

const TABS = [
  { id: "phones", label: "Telefones", icon: Phone },
  { id: "groups", label: "Grupos", icon: Users },
  { id: "prompt", label: "Prompt IA", icon: Bot },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CampaignDetailClient({ campaign: initial, initialPhones, initialGroups }: Props) {
  const [campaign, setCampaign] = useState(initial);
  const [phones, setPhones] = useState(initialPhones);
  const [activeTab, setActiveTab] = useState<TabId>("phones");
  const [showEdit, setShowEdit] = useState(false);

  async function handleToggleActive() {
    const res = await fetch(`/api/campanhas/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !campaign.is_active }),
    });
    if (res.ok) setCampaign((prev) => ({ ...prev, is_active: !prev.is_active }));
  }

  async function handleSave(form: CampaignFormData) {
    const res = await fetch(`/api/campanhas/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const updated = await res.json();
      setCampaign((prev) => ({ ...prev, ...updated }));
    }
    setShowEdit(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">{campaign.name}</h1>
            <span
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-md font-medium tracking-wide uppercase",
                campaign.is_active
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-zinc-800/80 text-zinc-500"
              )}
            >
              {campaign.is_active ? "● Ativa" : "○ Inativa"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {campaign.niche && (
              <span className="px-2 py-0.5 bg-zinc-800/80 text-zinc-300 text-[11px] rounded-md">
                {campaign.niche}
              </span>
            )}
            <span className="text-zinc-500 text-xs">Disparo a cada {campaign.timer_minutes}min</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggleActive}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors"
          >
            {campaign.is_active ? (
              <><ToggleRight className="w-4 h-4 text-emerald-400" strokeWidth={1.75} /> Desativar</>
            ) : (
              <><ToggleLeft className="w-4 h-4 text-zinc-500" strokeWidth={1.75} /> Ativar</>
            )}
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-xs rounded-full transition-all glow-orange-sm"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} /> Editar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900/50 border border-zinc-800/70 rounded-full p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                active
                  ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_0_12px_rgba(255,107,53,0.35)]"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "phones" && (
        <PhonesTab campaignId={campaign.id} initialPhones={phones} />
      )}
      {activeTab === "groups" && (
        <GroupsTab campaignId={campaign.id} initialGroups={initialGroups} initialPhones={phones} />
      )}
      {activeTab === "prompt" && (
        <PromptTab campaign={campaign} onSave={handleSave} />
      )}

      {showEdit && (
        <CampaignModal campaign={campaign} onSave={handleSave} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

function PromptTab({
  campaign,
  onSave,
}: {
  campaign: Campaign;
  onSave: (data: CampaignFormData) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(campaign.ai_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      name: campaign.name,
      niche: campaign.niche ?? "",
      timer_minutes: campaign.timer_minutes,
      ai_prompt: prompt,
      is_active: campaign.is_active,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="glass rounded-2xl p-7">
      <h3 className="text-white font-display font-semibold tracking-tight">Prompt da IA</h3>
      <p className="text-zinc-500 text-sm mt-1 mb-5">
        Instruções que a IA usará para gerar as legendas das ofertas desta campanha.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={12}
        placeholder="Ex: Você é um especialista em copy para ofertas geek. Crie uma legenda impactante em português, com emojis relevantes, destacando o desconto e o produto. Máximo de 3 linhas. Tom animado e urgente."
        className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 resize-none transition"
      />
      <div className="flex justify-end mt-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "px-5 py-2.5 text-white text-sm rounded-xl transition-all font-medium disabled:opacity-50",
            saved
              ? "bg-emerald-600"
              : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 glow-orange-sm"
          )}
        >
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar prompt"}
        </button>
      </div>
    </div>
  );
}
