import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import CampaignDetailClient from "@/components/campanhas/campaign-detail-client";
import type { Database } from "@/lib/types/database";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type CampaignPhone = Database["public"]["Tables"]["campaign_phones"]["Row"];
type CampaignGroup = Database["public"]["Tables"]["campaign_groups"]["Row"];

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  const campaign = data as Campaign | null;
  if (!campaign) return notFound();

  const [phonesResult, groupsResult] = await Promise.all([
    supabase.from("campaign_phones").select("*").eq("campaign_id", id).order("created_at"),
    supabase.from("campaign_groups").select("*").eq("campaign_id", id).order("group_name"),
  ]);

  const phones = (phonesResult.data ?? []) as CampaignPhone[];
  const groups = (groupsResult.data ?? []) as CampaignGroup[];

  // Perfil (nicho) da campanha — as palavras-chave vivem no perfil.
  const perfilId = (campaign as unknown as { perfil_id?: string | null }).perfil_id ?? null;
  let perfilNome: string | null = null;
  if (perfilId) {
    const { data: perfil } = await supabase.from("perfis").select("nome").eq("id", perfilId).maybeSingle();
    perfilNome = (perfil as { nome?: string } | null)?.nome ?? null;
  }

  return (
    <div>
      <nav className="flex items-center gap-1 text-sm text-gray-400 mb-6">
        <Link href="/campanhas" className="hover:text-white transition-colors">
          Campanhas
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-white">{campaign.name}</span>
      </nav>

      <CampaignDetailClient
        campaign={campaign}
        initialPhones={phones}
        initialGroups={groups}
        perfilId={perfilId}
        perfilNome={perfilNome}
      />
    </div>
  );
}
