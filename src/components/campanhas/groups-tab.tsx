"use client";

import { useState } from "react";
import { Users, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";

type CampaignGroup = Database["public"]["Tables"]["campaign_groups"]["Row"];
type CampaignPhone = Database["public"]["Tables"]["campaign_phones"]["Row"];

interface Props {
  campaignId: string;
  initialGroups: CampaignGroup[];
  initialPhones: CampaignPhone[];
}

export default function GroupsTab({ campaignId, initialGroups, initialPhones }: Props) {
  const [groups, setGroups] = useState(initialGroups);
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const connectedPhones = initialPhones.filter((p) => p.is_active);
  const filtered = groups.filter((g) =>
    g.group_name.toLowerCase().includes(search.toLowerCase())
  );
  const enabledCount = groups.filter((g) => g.is_enabled).length;

  async function handleToggle(group: CampaignGroup) {
    setToggling(group.id);
    const res = await fetch(`/api/campanhas/${campaignId}/groups`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: group.id, is_enabled: !group.is_enabled }),
    });
    if (res.ok) {
      setGroups((prev) =>
        prev.map((g) => (g.id === group.id ? { ...g, is_enabled: !g.is_enabled } : g))
      );
    }
    setToggling(null);
  }

  async function handleSyncAll() {
    if (connectedPhones.length === 0) {
      alert("Nenhum telefone conectado. Conecte um telefone na aba Telefones primeiro.");
      return;
    }
    setSyncing(true);
    let total = 0;
    for (const phone of connectedPhones) {
      const res = await fetch(`/api/campanhas/${campaignId}/phones/${phone.id}/groups`, {
        method: "POST",
      });
      if (res.ok) {
        const { synced } = await res.json();
        total += synced;
      }
    }
    const res = await fetch(`/api/campanhas/${campaignId}/groups`);
    if (res.ok) {
      const updated = await res.json();
      setGroups(updated);
    }
    setSyncing(false);
    alert(total > 0 ? `${total} grupos sincronizados!` : "Nenhum grupo novo encontrado.");
  }

  async function handleBulk(enable: boolean) {
    const targets = filtered.filter((g) => g.is_enabled !== enable);
    for (const group of targets) {
      await fetch(`/api/campanhas/${campaignId}/groups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: group.id, is_enabled: enable }),
      });
    }
    setGroups((prev) =>
      prev.map((g) => (filtered.some((f) => f.id === g.id) ? { ...g, is_enabled: enable } : g))
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-sm">
          <span className="text-white font-medium">{enabledCount}</span> de{" "}
          <span className="text-white font-medium">{groups.length}</span> grupos habilitados
        </p>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
          {syncing ? "Sincronizando..." : "Sincronizar grupos"}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
            <Users className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Nenhum grupo sincronizado ainda</p>
          <p className="text-zinc-500 text-sm mt-1.5">
            {connectedPhones.length === 0
              ? "Conecte um telefone na aba Telefones primeiro."
              : "Clique em ‘Sincronizar grupos’ para importar os grupos do WhatsApp."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" strokeWidth={1.75} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome do grupo..."
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-full pl-10 pr-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition"
              />
            </div>
            <button
              onClick={() => handleBulk(true)}
              className="px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs rounded-full transition-colors whitespace-nowrap"
            >
              Habilitar todos
            </button>
            <button
              onClick={() => handleBulk(false)}
              className="px-3.5 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 text-xs rounded-full transition-colors whitespace-nowrap"
            >
              Desabilitar todos
            </button>
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto scroll-thin divide-y divide-zinc-800/60">
              {filtered.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        group.is_enabled
                          ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                          : "bg-zinc-700"
                      )}
                    />
                    <span className="text-white text-sm tracking-tight truncate">{group.group_name}</span>
                    <span className="text-zinc-600 text-[11px] font-mono shrink-0 hidden sm:block">
                      {group.group_jid.split("@")[0]}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggle(group)}
                    disabled={toggling === group.id}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 shrink-0 ml-4",
                      group.is_enabled
                        ? "bg-gradient-to-r from-orange-500 to-orange-600"
                        : "bg-zinc-800"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                        group.is_enabled && "translate-x-4"
                      )}
                    />
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center text-zinc-500 text-sm">
                  Nenhum grupo encontrado para &ldquo;{search}&rdquo;
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
