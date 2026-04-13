"use client";

import { useState } from "react";
import { Phone, Users, Bot, ToggleRight, ToggleLeft, Pencil } from "lucide-react";
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
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                campaign.is_active
                  ? "bg-green-900/50 text-green-400"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {campaign.is_active ? "● Ativa" : "○ Inativa"}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {campaign.niche && (
              <span className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full">
                {campaign.niche}
              </span>
            )}
            <span className="text-gray-500 text-xs">Disparo a cada {campaign.timer_minutes}min</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggleActive}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            {campaign.is_active ? (
              <><ToggleRight className="w-4 h-4 text-green-500" /> Desativar</>
            ) : (
              <><ToggleLeft className="w-4 h-4 text-gray-500" /> Ativar</>
            )}
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            <Pencil className="w-4 h-4" /> Editar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-white font-medium mb-1">Prompt da IA</h3>
      <p className="text-gray-400 text-sm mb-4">
        Instruções que a IA usará para gerar as legendas das ofertas desta campanha.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={12}
        placeholder="Ex: Você é um especialista em copy para ofertas geek. Crie uma legenda impactante em português, com emojis relevantes, destacando o desconto e o produto. Máximo de 3 linhas. Tom animado e urgente."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
      />
      <div className="flex justify-end mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-5 py-2 text-white text-sm rounded-lg transition-colors font-medium disabled:opacity-50 ${
            saved ? "bg-green-600" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar Prompt"}
        </button>
      </div>
    </div>
  );
}
