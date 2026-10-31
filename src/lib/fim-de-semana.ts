// Fim de semana na Ofertas Maternas (31/Out, Bruno: "coloca no máximo 30 espalhadas pelo dia").
// A equipe postava ~17/dia no sábado e no domingo (×59 no dia útil); o automático vinha postando 47–55.
// Só a campanha geral; as de categoria (Fraldas/Cupons/Enxoval) seguem a própria regra.

export const TETO_FIM_DE_SEMANA = 30;

export function fimDeSemanaBrt(): boolean {
  const d = new Date(Date.now() - 3 * 3600_000).getUTCDay();
  return d === 0 || d === 6;
}

const ehGeral = (c: { categoria?: string | null }) => (c.categoria ?? "geral") === "geral";

/** teto do dia valendo agora (no fim de semana a geral fica em no máx. 30) */
export function tetoDoDia(c: { categoria?: string | null; auto_daily_cap: number }): number {
  return ehGeral(c) && fimDeSemanaBrt() ? Math.min(c.auto_daily_cap, TETO_FIM_DE_SEMANA) : c.auto_daily_cap;
}

/** intervalo valendo agora: no fim de semana a geral espalha os 30 pela janela (8h–20h → 24 min), sem os 2 min da manhã */
export function intervaloFimDeSemana(c: { categoria?: string | null; auto_window_start?: number | null; auto_window_end?: number | null }): number | null {
  if (!ehGeral(c) || !fimDeSemanaBrt()) return null;
  const horas = (c.auto_window_end ?? 20) - (c.auto_window_start ?? 8);
  return Math.floor((horas * 60) / TETO_FIM_DE_SEMANA);
}
