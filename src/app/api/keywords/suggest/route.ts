import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { NICHE_TERMS_MATERNIDADE } from "@/lib/niche-terms";

// Autocomplete de tipos de produto do nicho (dicionário estático, sem variações).
// Futuro: escolher o dicionário pelo perfil (?nicho=geek etc).
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = fold(new URL(request.url).searchParams.get("q") ?? "");
  const terms = NICHE_TERMS_MATERNIDADE;
  if (!q) return NextResponse.json(terms.slice(0, 20));

  // Prioriza quem começa com o termo, depois quem contém.
  const starts: string[] = [];
  const contains: string[] = [];
  for (const t of terms) {
    const f = fold(t);
    if (f.startsWith(q)) starts.push(t);
    else if (f.includes(q)) contains.push(t);
  }
  return NextResponse.json([...starts, ...contains].slice(0, 12));
}
