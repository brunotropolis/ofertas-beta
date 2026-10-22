/**
 * Link curto da marca (22/Out): todo link postado nos grupos passa pelo nosso encurtador
 * (<short_domain>/l/<slug>) pra contar clique por grupo. Ofertas que chegaram com link direto da loja
 * (coletores Shopee/ML, Fralda Barata) ganham o slug na hora de postar — 1 gravação no encurtador por produto,
 * não por grupo (o grupo vai como ?g=<nº> e é lido no clique).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

const slugDe = (url: string) => {
  const n = parseInt(createHash("sha1").update(url).digest("hex").slice(0, 10), 16);
  return "o" + n.toString(36).padStart(6, "0").slice(-6);
};

/** Devolve o link curto da oferta (registra no encurtador e grava na oferta se ainda não for nosso). */
export async function garantirLinkCurto(db: DB, offerId: string, link: string, shortDomain: string | null): Promise<string> {
  if (!shortDomain || !link || link.includes(`${shortDomain}/l/`)) return link;
  const secret = process.env.UTM_WORKER_SECRET;
  if (!secret) return link;
  const slug = slugDe(link);
  try {
    const r = await fetch("https://manualdorecemnascido.com.br/_utmapi/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Worker-Secret": secret },
      body: JSON.stringify({ slug, url: link, description: "oferta (dispatcher)", hidden: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return link;
  } catch {
    return link; // encurtador fora: posta com o link direto (não trava o post)
  }
  const curto = `https://${shortDomain}/l/${slug}`;
  await db.from("offers").update({ affiliate_url: curto }).eq("id", offerId);
  return curto;
}

/** Marca do grupo no link: nº do "As Ofertas Maternas #N"; outros grupos = final do id. */
export function marcaGrupo(groupName: string | null | undefined, jid: string): string {
  const m = (groupName || "").match(/^As Ofertas Maternas\s*#\s*(\d+)/i);
  return m ? m[1] : "x" + jid.replace(/\D/g, "").slice(-6);
}

export const comGrupo = (link: string, g: string) => `${link}${link.includes("?") ? "&" : "?"}g=${g}`;
