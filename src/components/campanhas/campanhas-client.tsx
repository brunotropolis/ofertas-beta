"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/profile-context";
import CampaignModal, { type CampaignFormData } from "./campaign-modal";
import CampaignDetailClient from "./campaign-detail-client";
import type { Database } from "@/lib/types/database";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type PhoneRow = Database["public"]["Tables"]["campaign_phones"]["Row"];
type GroupRow = Database["public"]["Tables"]["campaign_groups"]["Row"];
type Detail = { campaign: CampaignRow; phones: PhoneRow[]; groups: GroupRow[] };
type CampaignWithCounts = CampaignRow & {
  campaign_phones: { count: number }[];
  campaign_groups: { count: number }[];
};

interface Props {
  initialCampaigns: CampaignWithCounts[];
}

export default function CampanhasClient({ initialCampaigns }: Props) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { perfilId, perfil } = usePerfil();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visibleCampaigns = perfilId
    ? campaigns.filter((c) => (c as any).perfil_id === perfilId)
    : campaigns;

  // Campanha aberta: a escolhida, senão a primeira ativa do perfil, senão a primeira.
  const openId =
    (selectedId && visibleCampaigns.some((c) => c.id === selectedId) ? selectedId : null) ??
    visibleCampaigns.find((c) => c.is_active)?.id ??
    visibleCampaigns[0]?.id ??
    null;

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    let alive = true;
    setLoadingDetail(true);
    fetch(`/api/campanhas/${openId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const { campaign_phones, campaign_groups, campaign_platforms: _p, ...campaign } = d;
        void _p;
        setDetail({
          campaign: campaign as CampaignRow,
          phones: (campaign_phones ?? []) as PhoneRow[],
          groups: ((campaign_groups ?? []) as GroupRow[]).sort((a, b) => (a.group_name ?? "").localeCompare(b.group_name ?? "")),
        });
      })
      .finally(() => alive && setLoadingDetail(false));
    return () => { alive = false; };
  }, [openId]);

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }


  function closeModal() {
    setShowModal(false);
    setEditing(null);
  }

  async function handleSave(form: CampaignFormData) {
    if (editing) {
      const res = await fetch(`/api/campanhas/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao salvar campanha`);
      }
      const updated = await res.json();
      setCampaigns((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    } else {
      const res = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, perfil_id: perfilId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status} ao criar campanha`);
      }
      const created = await res.json();
      setCampaigns((prev) => [
        { ...created, campaign_phones: [{ count: 0 }], campaign_groups: [{ count: 0 }] },
        ...prev,
      ]);
    }
    closeModal();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta campanha? Esta ação não pode ser desfeita.")) return;
    setDeletingId(id);
    const res = await fetch(`/api/campanhas/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setSelectedId(null);
    }
    setDeletingId(null);
  }


  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Campanhas</h1>
          <p className="text-zinc-500 text-sm mt-1">Gerencie suas campanhas de divulgação</p>
        </div>
        <button
          onClick={openCreate}
          className="group flex items-center gap-2 pl-3 pr-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-sm font-medium rounded-full transition-all glow-orange-sm hover:glow-orange"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          Nova campanha
        </button>
      </div>

      {visibleCampaigns.length === 0 ? (
        <EmptyCard
          icon={<Megaphone className="w-8 h-8 text-zinc-600" strokeWidth={1.5} />}
          title="Nenhuma campanha neste perfil"
          subtitle="Crie uma campanha para começar a publicar ofertas deste perfil"
        />
      ) : (
        <>
          {visibleCampaigns.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-6">
              {visibleCampaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm border transition-all",
                    c.id === openId
                      ? "bg-orange-500/15 border-orange-500/50 text-white"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", c.is_active ? "bg-emerald-400" : "bg-zinc-600")} />
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {detail && detail.campaign.id === openId ? (
            <CampaignDetailClient
              key={detail.campaign.id}
              campaign={detail.campaign}
              initialPhones={detail.phones}
              initialGroups={detail.groups}
              perfilId={perfilId}
              perfilNome={perfil?.nome ?? null}
              onChanged={(u) => setCampaigns((prev) => prev.map((c) => (c.id === u.id ? { ...c, ...u } : c)))}
              onDelete={() => handleDelete(detail.campaign.id)}
            />
          ) : (
            <div className="glass rounded-2xl p-12 text-center text-zinc-500 text-sm">
              {loadingDetail ? "Carregando campanha..." : "Selecione uma campanha"}
            </div>
          )}
        </>
      )}

      {showModal && (
        <CampaignModal campaign={editing} onSave={handleSave} onClose={closeModal} />
      )}
    </div>
  );
}

function EmptyCard({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="glass rounded-2xl p-12 text-center">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
        {icon}
      </div>
      <p className="text-zinc-200 font-medium tracking-tight">{title}</p>
      <p className="text-zinc-500 text-sm mt-1.5">{subtitle}</p>
    </div>
  );
}
