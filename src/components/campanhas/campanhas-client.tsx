"use client";

import { useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Phone, Users, Clock, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import CampaignModal, { type CampaignFormData } from "./campaign-modal";
import Link from "next/link";
import type { Database } from "@/lib/types/database";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
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

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(c: CampaignRow) {
    setEditing(c);
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
      if (res.ok) {
        const updated = await res.json();
        setCampaigns((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
      }
    } else {
      const res = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const created = await res.json();
        setCampaigns((prev) => [
          { ...created, campaign_phones: [{ count: 0 }], campaign_groups: [{ count: 0 }] },
          ...prev,
        ]);
      }
    }
    closeModal();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta campanha? Esta ação não pode ser desfeita.")) return;
    setDeletingId(id);
    const res = await fetch(`/api/campanhas/${id}`, { method: "DELETE" });
    if (res.ok) setCampaigns((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
  }

  async function handleToggle(campaign: CampaignWithCounts) {
    const res = await fetch(`/api/campanhas/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !campaign.is_active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCampaigns((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campanhas</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie suas campanhas de divulgação</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Megaphone className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Nenhuma campanha criada ainda.</p>
          <p className="text-gray-500 text-sm mt-1">
            Crie sua primeira campanha para começar a publicar ofertas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/campanhas/${campaign.id}`}
                    className="text-white font-semibold text-base hover:text-blue-400 transition-colors block truncate"
                  >
                    {campaign.name}
                  </Link>
                  {campaign.niche && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full">
                      {campaign.niche}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(campaign)}
                  title={campaign.is_active ? "Desativar" : "Ativar"}
                >
                  {campaign.is_active ? (
                    <ToggleRight className="w-6 h-6 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-500" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  <span>{campaign.campaign_phones?.[0]?.count ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>{campaign.campaign_groups?.[0]?.count ?? 0} grupos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{campaign.timer_minutes}min</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    campaign.is_active
                      ? "bg-green-900/50 text-green-400"
                      : "bg-gray-800 text-gray-500"
                  )}
                >
                  {campaign.is_active ? "● Ativa" : "○ Inativa"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(campaign)}
                    className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    disabled={deletingId === campaign.id}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CampaignModal campaign={editing} onSave={handleSave} onClose={closeModal} />
      )}
    </div>
  );
}
