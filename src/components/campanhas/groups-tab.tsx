"use client";

import { useState } from "react";
import { Users, Search, RefreshCw } from "lucide-react";
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
    // Reload groups list
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
        <p className="text-gray-400 text-sm">
          <span className="text-white font-medium">{enabledCount}</span> de{" "}
          <span className="text-white font-medium">{groups.length}</span> grupos habilitados
        </p>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar Grupos"}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Nenhum grupo sincronizado ainda.</p>
          <p className="text-gray-500 text-sm mt-1">
            {connectedPhones.length === 0
              ? "Conecte um telefone na aba Telefones primeiro."
              : "Clique em 'Sincronizar Grupos' para importar os grupos do WhatsApp."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome do grupo..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => handleBulk(true)}
              className="px-3 py-2 bg-green-900/40 hover:bg-green-900/60 text-green-400 text-sm rounded-lg transition-colors whitespace-nowrap"
            >
              Habilitar todos
            </button>
            <button
              onClick={() => handleBulk(false)}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm rounded-lg transition-colors whitespace-nowrap"
            >
              Desabilitar todos
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-800">
              {filtered.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        group.is_enabled ? "bg-green-400" : "bg-gray-600"
                      }`}
                    />
                    <span className="text-white text-sm truncate">{group.group_name}</span>
                    <span className="text-gray-600 text-xs font-mono shrink-0 hidden sm:block">
                      {group.group_jid.split("@")[0]}
                    </span>
                  </div>
                  <button
                    onClick={() => handleToggle(group)}
                    disabled={toggling === group.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 shrink-0 ml-4 ${
                      group.is_enabled ? "bg-blue-600" : "bg-gray-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        group.is_enabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-500 text-sm">
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
