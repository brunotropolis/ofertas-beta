"use client";

import { useState } from "react";
import { Phone, Users, Store, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import PhonesTab from "./phones-tab";
import GroupsTab from "./groups-tab";
import PlatformsTab from "./platforms-tab";
import KeywordsTab from "./keywords-tab";
import CampaignSettings from "./campaign-settings";
import type { Database } from "@/lib/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type CampaignPhone = Database["public"]["Tables"]["campaign_phones"]["Row"];
type CampaignGroup = Database["public"]["Tables"]["campaign_groups"]["Row"];

interface Props {
  campaign: Campaign;
  initialPhones: CampaignPhone[];
  initialGroups: CampaignGroup[];
  perfilId: string | null;
  perfilNome: string | null;
  onChanged?: (c: Campaign) => void;
  onDelete?: () => void;
}

const TABS = [
  { id: "phones", label: "Telefones", icon: Phone },
  { id: "groups", label: "Grupos", icon: Users },
  { id: "platforms", label: "Plataformas", icon: Store },
  { id: "keywords", label: "Palavras-chave", icon: Tag },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CampaignDetailClient({ campaign: initial, initialPhones, initialGroups, perfilId, perfilNome, onChanged, onDelete }: Props) {
  const [campaign, setCampaign] = useState(initial);
  const [phones, setPhones] = useState(initialPhones);
  const [activeTab, setActiveTab] = useState<TabId>("phones");
  function handleSaved(updated: Campaign) {
    setCampaign((prev) => ({ ...prev, ...updated }));
    onChanged?.(updated);
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

      </div>

      <CampaignSettings campaign={campaign} onSaved={handleSaved} onDelete={onDelete} />

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
      {activeTab === "platforms" && (
        <PlatformsTab campaignId={campaign.id} />
      )}
      {activeTab === "keywords" && (
        <KeywordsTab perfilId={perfilId} perfilNome={perfilNome} />
      )}

    </div>
  );
}
