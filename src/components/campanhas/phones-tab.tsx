"use client";

import { useState } from "react";
import { Plus, Trash2, Phone, Wifi, WifiOff, RefreshCw } from "lucide-react";
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [adding, setAdding] = useState(false);
  const [qrData, setQrData] = useState<{ phoneId: string; qr: string | null } | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  async function handleAddPhone() {
    if (!phoneNumber.trim()) return;
    setAdding(true);
    const res = await fetch(`/api/campanhas/${campaignId}/phones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: phoneNumber, is_admin: isAdmin }),
    });
    if (res.ok) {
      const newPhone = await res.json();
      setPhones((prev) => [...prev, newPhone]);
      setShowAdd(false);
      setPhoneNumber("");
      setIsAdmin(false);
      await handleGetQR(newPhone.id);
    } else {
      const err = await res.json();
      alert(`Erro: ${err.error}`);
    }
    setAdding(false);
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
      const { synced } = await res.json();
      alert(`${synced} grupos sincronizados! Vá para a aba Grupos para habilitá-los.`);
    } else {
      const err = await res.json();
      alert(`Erro: ${err.error}`);
    }
    setSyncingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">{phones.length} telefone(s) cadastrado(s)</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Adicionar Telefone
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4">Novo Telefone</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-300 block mb-1.5">Número (com DDI)</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="5511999999999"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-300">Telefone admin</p>
                <p className="text-xs text-gray-500">Admin não dispara mensagens</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdmin((p) => !p)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isAdmin ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAdmin ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowAdd(false); setPhoneNumber(""); }}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddPhone}
                disabled={adding}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors font-medium"
              >
                {adding ? "Criando..." : "Criar e Conectar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code box */}
      {qrData && (
        <div className="bg-gray-900 border border-blue-600 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Conectar WhatsApp</h3>
            <button onClick={() => setQrData(null)} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Abra o WhatsApp → Menu → Aparelhos Conectados → Conectar Aparelho → escaneie o QR:
          </p>
          <div className="flex justify-center mb-4">
            {qrData.qr ? (
              qrData.qr.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrData.qr} alt="QR Code" className="w-52 h-52 rounded-lg bg-white p-1" />
              ) : (
                <div className="bg-white p-3 rounded-lg text-center">
                  <p className="text-black text-xs font-mono break-all max-w-xs">{qrData.qr.slice(0, 150)}…</p>
                </div>
              )
            ) : (
              <p className="text-gray-500 text-sm">Aguardando QR Code...</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleGetQR(qrData.phoneId)}
              disabled={polling === qrData.phoneId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${polling === qrData.phoneId ? "animate-spin" : ""}`} />
              Atualizar QR
            </button>
            <button
              onClick={() => handleGetQR(qrData.phoneId)}
              disabled={polling === qrData.phoneId}
              className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg transition-colors font-medium"
            >
              Já escaneei ✓
            </button>
          </div>
        </div>
      )}

      {/* Phones list */}
      {phones.length === 0 && !showAdd ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <Phone className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Nenhum telefone cadastrado.</p>
          <p className="text-gray-500 text-sm mt-1">
            Adicione um telefone para conectar ao WhatsApp e sincronizar grupos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {phones.map((phone) => (
            <div
              key={phone.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  phone.is_active ? "bg-green-900/50" : "bg-gray-800"
                }`}
              >
                {phone.is_active ? (
                  <Wifi className="w-5 h-5 text-green-400" />
                ) : (
                  <WifiOff className="w-5 h-5 text-gray-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{phone.phone_number}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className={`text-xs ${phone.is_active ? "text-green-400" : "text-gray-500"}`}>
                    {phone.is_active ? "● Conectado" : "○ Desconectado"}
                  </span>
                  {phone.is_admin && (
                    <span className="text-xs bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">Admin</span>
                  )}
                  <span className="text-xs text-gray-600 font-mono truncate">
                    {phone.evolution_instance_id}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!phone.is_active && (
                  <button
                    onClick={() => handleGetQR(phone.id)}
                    disabled={polling === phone.id}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                  >
                    {polling === phone.id ? "..." : "Conectar"}
                  </button>
                )}
                {phone.is_active && (
                  <button
                    onClick={() => handleSyncGroups(phone.id)}
                    disabled={syncingId === phone.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingId === phone.id ? "animate-spin" : ""}`} />
                    Sync Grupos
                  </button>
                )}
                <button
                  onClick={() => handleDelete(phone.id)}
                  className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
