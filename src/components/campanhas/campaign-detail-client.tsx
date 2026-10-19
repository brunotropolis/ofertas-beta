"use client";

import { useState } from "react";
import { Phone, Users, Store, Database as Fonte } from "lucide-react";
import { cn } from "@/lib/utils";
import PhonesTab from "./phones-tab";
import GroupsTab from "./groups-tab";
import PlatformsTab from "./platforms-tab";
import CampaignSettings from "./campaign-settings";
import type { Numero } from "./perfil-saude";
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
  numeros?: Numero[];
  onChanged?: (c: Campaign) => void;
  onDelete?: () => void;
}

const TABS = [
  { id: "phones", label: "Telefones", icon: Phone },
  { id: "groups", label: "Grupos", icon: Users },
  { id: "platforms", label: "Plataformas", icon: Store },
] as const;

type TabId = (typeof TABS)[number]["id"];

// De onde vem o que a campanha posta (campaigns.categoria — lib/auto-categorias.ts)
const FONTE: Record<string, string> = {
  geral: "Mix do perfil: @promocaozinha + coletores (Shopee, ML, Amazon pelas palavras-chave), metas de fralda 35% e Amazon 45%.",
  fraldas: "Fraldas em promoção do Fralda Barata: menor preço do mês, desconto ≥15% ou bem abaixo do preço por fralda do tamanho.",
  cupons: "Cupons do Telegram (últimas 3h) com o nosso link, sem repetir código no dia e sem os marcados como esgotados.",
  enxoval: "Produtos de enxoval que os coletores e o Telegram trazem, filtrados por palavra (body, manta, kit berço, banheira…).",
};

export default function CampaignDetailClient({ campaign: initial, initialPhones, initialGroups, perfilId, numeros = [], onChanged, onDelete }: Props) {
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

      {perfilId && numeros.length > 0 ? (
        <>
          <div className="flex items-start gap-2 text-[12px] text-zinc-400 mb-4 px-1">
            <Fonte className="w-3.5 h-3.5 mt-0.5 text-orange-400 shrink-0" strokeWidth={1.75} />
            <span><b className="text-zinc-200">Fonte das ofertas:</b> {FONTE[(campaign as unknown as { categoria?: string }).categoria ?? "geral"]}</span>
          </div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
            <Users className="w-4 h-4 text-orange-400" strokeWidth={1.75} /> Grupos da campanha
          </h3>
          <GroupsTab campaignId={campaign.id} initialGroups={initialGroups} initialPhones={phones} numeros={numeros} />
        </>
      ) : (<>
      {/* Tabs (campanha sem perfil/WAHA: telefones Evolution, grupos, plataformas por campanha) */}
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
      </>)}

    </div>
  );
}
