// Plantão da Black (26/11, Bruno: "postagens até mais tarde hoje e amanhã ser das 6 até 00h").
// Vale nos perfis de maternidade (Maternas, Lar, Mãe e canais deles); o Brunotropolis (geek) segue a janela dele.
// 26/11: a janela vai até meia-noite. 27/11 (Black Friday): virada da meia-noite à 1h59 (Bruno: "quero que rode sim",
// os concorrentes soltam ~200 posts na virada), pausa das 2h às 6h, e das 6h à meia-noite.
// mult = teto do dia × mult sobre o teto do banco (que desde 26/11 já é o de dia normal com janela até 23h).
// No dia 28 volta sozinho pro que está no banco.

const PERFIL_GEEK = "f3887ae2-7b2c-462b-8984-e1e6618a0ba6";
type Plantao = { ini?: number; fim: number; mult: number; pausa?: [number, number] };
const DIAS: Record<string, Plantao> = {
  "2026-11-26": { fim: 24, mult: 1.16 },
  "2026-11-27": { ini: 0, fim: 24, mult: 1.46, pausa: [2, 6] },
};

/** madrugada sem post no dia de plantão (entre a virada e as 6h) */
export function emPausaPlantao(hora: number, perfilId?: string | null): boolean {
  const p = plantaoHoje();
  if (!p?.pausa || !perfilId || perfilId === PERFIL_GEEK) return false;
  return hora >= p.pausa[0] && hora < p.pausa[1];
}

export function plantaoHoje(): Plantao | null {
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
  if (c.auto_daily_cap != null) out.auto_daily_cap = Math.round(c.auto_daily_cap * p.mult);
  return out;
}
