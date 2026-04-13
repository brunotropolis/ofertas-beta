import { createClient } from "@/lib/supabase/server";
import CampanhasClient from "@/components/campanhas/campanhas-client";

export default async function CampanhasPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*, campaign_phones(count), campaign_groups(count)")
    .order("created_at", { ascending: false });

  return <CampanhasClient initialCampaigns={(campaigns ?? []) as Parameters<typeof CampanhasClient>[0]["initialCampaigns"]} />;
}
