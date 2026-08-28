"use client";

import { useState } from "react";
import { Plus, Trash2, Phone, Wifi, WifiOff, RefreshCw, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types/database";

type CampaignPhone = Database["public"]["Tables"]["campaign_phones"]["Row"];

interface Props {
  campaignId: string;
  initialPhones: CampaignPhone[];
}

export default function PhonesTab({ campaignId, initialPhones }: Props) {
  const [phones, setPhones] = useState(initialPhones);
  const [showAdd, setShowAdd] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [label, setLabel] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [qrData, setQrData] = useState<{ phoneId: string; qr: string | null } | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  async function handleAddPhone() {
    if (!phoneNumber.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/campanhas/${campaignId}/phones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phoneNumber, label: label.trim() || null, is_admin: isAdmin }),
    });
    if (res.ok) {
      const newPhone = await res.json();
      setPhones((prev) => [...prev, newPhone]);
      setShowAdd(false);
      setPhoneNumber("");
      setLabel("");
      setIsAdmin(false);
      await handleGetQR(newPhone.id);
    } else {
      const err = await res.json();
      alert(`Erro: ${err.error}`);
    }
    setAdding(false);
  }

  async function handleSaveLabel(phoneId: string) {
    const res = await fetch(`/api/campanhas/${campaignId}/phones/${phoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim() || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPhones((prev) => prev.map((p) => (p.id === phoneId ? { ...p, label: updated.label } : p)));
    }
    setEditingId(null);
  }

  async function handleGetQR(phoneId: string) {
    setPolling(phoneId);
    const res = await fetch(`/api/campanhas/${campaignId}/phones/${phoneId}/qr`);
    if (res.ok) {
      const data = await res.json();
      if (data.connected) {
        setPhones((prev) => prev.map((p) => (p.id === phoneId ? { ...p, is_active: true } : p)));
        setQrData(null);
      } else {
        setQrData({ phoneId, qr: data.qr });
      }
    }
    setPolling(null);
  }

  async function handleDelete(phoneId: string) {
    if (!confirm("Remover este telefone?")) return;
    const res = await fetch(`/api/campanhas/${campaignId}/phones/${phoneId}`, { method: "DELETE" });
    if (res.ok) {
      setPhones((prev) => prev.filter((p) => p.id !== phoneId));
      if (qrData?.phoneId === phoneId) setQrData(null);
    }
  }

  async function handleSyncGroups(phoneId: string) {
    setSyncingId(phoneId);
    const res = await fetch(`/api/campanhas/${campaignId}/phones/${phoneId}/groups`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.warning) {
        alert(data.warning);
      } else {
        alert(`${data.synced} grupos sincronizados! Vá para a aba Grupos para habilitá-los.`);
      }
    } else {
      const err = await res.json();
      alert(`Erro: ${err.error}`);
    }
    setSyncingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-zinc-500 text-sm">
          <span className="text-white font-medium">{phones.length}</span> telefone{phones.length !== 1 ? "s" : ""} cadastrado{phones.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white text-xs font-medium rounded-full transition-all glow-orange-sm"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          Adicionar telefone
        </button>
      </div>

      {showAdd && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-medium tracking-tight mb-4">Novo telefone</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider font-medium text-zinc-500 block mb-1.5">Nome do aparelho</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: iPhone Bruno, Chip Loja, Disparador 1"
                maxLength={60}
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition"
              />
              <p className="text-[11px] text-zinc-600 mt-1">Só pra você identificar. Opcional.</p>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider font-medium text-zinc-500 block mb-1.5">Número (com DDI)</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="5511999999999"
                className="w-full bg-zinc-900/70 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15 transition"
              />
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm text-zinc-200 tracking-tight">Telefone admin</p>
                <p className="text-xs text-zinc-500">Admin não dispara mensagens</p>
              </div>
              <SwitchToggle active={isAdmin} onChange={() => setIsAdmin((p) => !p)} />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowAdd(false); setPhoneNumber(""); }}
                className="flex-1 px-4 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddPhone}
                disabled={adding}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 text-white text-sm rounded-xl transition-all font-medium glow-orange-sm"
              >
                {adding ? "Criando..." : "Criar e conectar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrData && (
        <div className="glass rounded-2xl p-6 border-orange-500/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium tracking-tight">Conectar WhatsApp</h3>
            <button onClick={() => setQrData(null)} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
          </div>
          <p className="text-zinc-500 text-sm mb-4">
            Abra o WhatsApp → Menu → Aparelhos conectados → Conectar aparelho → escaneie o QR:
          </p>
          <div className="flex justify-center mb-4">
            {qrData.qr ? (
              qrData.qr.startsWith("data:") ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qrData.qr} alt="QR Code" className="w-52 h-52 rounded-xl bg-white p-2" />
              ) : (
                <div className="bg-white p-3 rounded-xl text-center">
                  <p className="text-black text-xs font-mono break-all max-w-xs">{qrData.qr.slice(0, 150)}…</p>
                </div>
              )
            ) : (
              <p className="text-zinc-500 text-sm">Aguardando QR Code...</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleGetQR(qrData.phoneId)}
              disabled={polling === qrData.phoneId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm rounded-xl transition-colors"
            >
              <RefreshCw className={cn("w-4 h-4", polling === qrData.phoneId && "animate-spin")} />
              Atualizar QR
            </button>
            <button
              onClick={() => handleGetQR(qrData.phoneId)}
              disabled={polling === qrData.phoneId}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl transition-colors font-medium"
            >
              Já escaneei ✓
            </button>
          </div>
        </div>
      )}

      {phones.length === 0 && !showAdd ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-zinc-900/70 border border-zinc-800/60 mb-4">
            <Phone className="w-7 h-7 text-zinc-600" strokeWidth={1.5} />
          </div>
          <p className="text-zinc-200 font-medium tracking-tight">Nenhum telefone cadastrado</p>
          <p className="text-zinc-500 text-sm mt-1.5">
            Adicione um telefone para conectar ao WhatsApp e sincronizar grupos
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {phones.map((phone) => (
            <div
              key={phone.id}
              className="glass rounded-2xl p-4 flex items-center gap-4 hover:border-zinc-700/80 transition-colors"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  phone.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-900/80 text-zinc-500"
                )}
              >
                {phone.is_active ? (
                  <Wifi className="w-5 h-5" strokeWidth={1.75} />
                ) : (
                  <WifiOff className="w-5 h-5" strokeWidth={1.75} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                {editingId === phone.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveLabel(phone.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={60}
                      placeholder="Nome do aparelho"
                      className="flex-1 min-w-0 bg-zinc-900/70 border border-orange-500/60 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/15"
                    />
                    <button
                      onClick={() => handleSaveLabel(phone.id)}
                      className="p-1.5 text-emerald-400 hover:bg-zinc-800/60 rounded-lg icon-only"
                      title="Salvar"
                    >
                      <Check className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 text-zinc-500 hover:bg-zinc-800/60 rounded-lg icon-only"
                      title="Cancelar"
                    >
                      <X className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium tracking-tight truncate">
                        {phone.label || phone.phone_number}
                      </p>
                      <button
                        onClick={() => { setEditingId(phone.id); setEditLabel(phone.label ?? ""); }}
                        className="p-1 text-zinc-500 hover:text-orange-400 hover:bg-zinc-800/60 rounded icon-only shrink-0"
                        title="Renomear aparelho"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className={cn("text-xs", phone.is_active ? "text-emerald-400" : "text-zinc-500")}>
                        {phone.is_active ? "● Conectado" : "○ Desconectado"}
                      </span>
                      {phone.label && (
                        <span className="text-[11px] text-zinc-500 font-mono">{phone.phone_number}</span>
                      )}
                      {phone.is_admin && (
                        <span className="text-[10px] uppercase tracking-wider font-medium bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">Admin</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!phone.is_active && (
                  <button
                    onClick={() => handleGetQR(phone.id)}
                    disabled={polling === phone.id}
                    className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 disabled:opacity-50 text-white text-xs rounded-full transition-all"
                  >
                    {polling === phone.id ? "..." : "Conectar"}
                  </button>
                )}
                {phone.is_active && (
                  <button
                    onClick={() => handleSyncGroups(phone.id)}
                    disabled={syncingId === phone.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-full transition-colors"
                  >
                    <RefreshCw className={cn("w-3 h-3", syncingId === phone.id && "animate-spin")} />
                    Sync grupos
                  </button>
                )}
                <button
                  onClick={() => handleDelete(phone.id)}
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/60 rounded-lg transition-colors"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SwitchToggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        active
          ? "bg-gradient-to-r from-orange-500 to-orange-600 shadow-[0_0_12px_rgba(255,107,53,0.35)]"
          : "bg-zinc-800"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          active && "translate-x-5"
        )}
      />
    </button>
  );
}
