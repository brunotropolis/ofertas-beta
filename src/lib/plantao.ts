// Plantão da Black (26/11, Bruno: "postagens até mais tarde hoje e amanhã ser das 6 até 00h").
// Vale nos perfis de maternidade (Maternas, Lar, Mãe e canais deles); o Brunotropolis (geek) segue a janela dele.
// 26/11: a janela vai até meia-noite. 27/11 (Black Friday): das 6h à meia-noite.
// O teto do dia cresce na mesma proporção das horas a mais (mesmo ritmo, só que por mais tempo).
// No dia 28 volta sozinho pro que está no banco.

const PERFIL_GEEK = "f3887ae2-7b2c-462b-8984-e1e6618a0ba6";
const DIAS: Record<string, { ini?: number; fim: number }> = {
  "2026-11-26": { fim: 24 },
  "2026-11-27": { ini: 6, fim: 24 },
};

export function plantaoHoje(): { ini?: number; fim: number } | null {
  const d = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  return DIAS[d] ?? null;
}

type CampJanela = { perfil_id?: string | null; auto_window_start?: number | null; auto_window_end?: number | null; auto_daily_cap?: number | null };

/** janela e teto valendo hoje (plantão estica a janela e sobe o teto na proporção) */
export function comPlantao<T extends CampJanela>(c: T): T {
  const p = plantaoHoje();
  if (!p || !c.perfil_id || c.perfil_id === PERFIL_GEEK) return c;
  const ini0 = c.auto_window_start ?? 8, fim0 = c.auto_window_end ?? 20;
  const ini = Math.min(ini0, p.ini ?? ini0), fim = Math.max(fim0, p.fim);
  const out = { ...c, auto_window_start: ini, auto_window_end: fim };
  if (c.auto_daily_cap != null && fim0 > ini0) out.auto_daily_cap = Math.round((c.auto_daily_cap * (fim - ini)) / (fim0 - ini0));
  return out;
}
