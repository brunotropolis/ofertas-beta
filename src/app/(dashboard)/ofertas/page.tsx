import { createClient } from "@/lib/supabase/server";
import OfferForm from "@/components/ofertas/offer-form";
import type { Database } from "@/lib/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];

export default async function OfertasPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data } = await db
    .from("campaigns")
    .select("*")
    .eq("is_active", true)
    .order("name");

  const campaigns = (data ?? []) as Campaign[];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-semibold text-white tracking-tightest">Nova oferta</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Cole a URL do produto, edite os dados e publique nas campanhas
        </p>
      </div>

      <OfferForm campaigns={campaigns} />
    </div>
  );
}
