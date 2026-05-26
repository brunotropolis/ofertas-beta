"use client";

import { useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Phone, Users, Clock } from "lucide-react";
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

      {campaigns.length === 0 ? (
        <EmptyCard
          icon={<Megaphone className="w-8 h-8 text-zinc-600" strokeWidth={1.5} />}
          title="Nenhuma campanha criada ainda"
          subtitle="Crie sua primeira campanha para começar a publicar ofertas"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="group relative glass rounded-2xl p-5 transition-all hover:border-orange-500/30 hover:shadow-[0_8px_32px_-12px_rgba(255,107,53,0.25)]"
            >
              {/* Top: name + toggle */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/campanhas/${campaign.id}`}
                    className="text-white font-semibold text-[17px] tracking-tight hover:text-orange-400 transition-colors block truncate"
                  >
                    {campaign.name}
                  </Link>
                  {campaign.niche && (
                    <span className="inline-block mt-1.5 px-2 py-0.5 bg-zinc-800/80 text-zinc-300 text-[11px] rounded-md tracking-wide">
                      {campaign.niche}
                    </span>
                  )}
                </div>
                <Toggle active={campaign.is_active} onChange={() => handleToggle(campaign)} />
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <Metric icon={Phone}  value={campaign.campaign_phones?.[0]?.count ?? 0} label="fones" />
                <Metric icon={Users}  value={campaign.campaign_groups?.[0]?.count ?? 0} label="grupos" />
                <Metric icon={Clock}  value={`${campaign.timer_minutes}m`} label="intervalo" />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/70">
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
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => openEdit(campaign)}
                    className="p-2 text-zinc-500 hover:text-orange-400 hover:bg-zinc-800/60 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    disabled={deletingId === campaign.id}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded-lg transition-colors disabled:opacity-50"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
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

function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: string | number; label: string }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-zinc-500 mb-0.5">
        <Icon className="w-3 h-3" strokeWidth={1.75} />
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-white text-sm font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      title={active ? "Desativar" : "Ativar"}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors shrink-0",
        active
          ? "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_12px_rgba(255,107,53,0.35)]"
          : "bg-zinc-800"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm",
          active && "translate-x-5"
        )}
      />
    </button>
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
