import crypto from "crypto";

export interface PlatformSecrets {
  api_key: string | null;
  api_secret: string | null;
  cookie: string | null;
  tag: string | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

// ── Amazon: OAuth Login with Amazon (client_credentials) ──
async function testAmazon(s: PlatformSecrets): Promise<TestResult> {
  if (!s.api_key || !s.api_secret) return { ok: false, message: "Faltam Access Key e Secret Key" };
  if (!s.tag) return { ok: false, message: "Falta a Partner Tag (ex: manualdorec0c-20)" };
  try {
    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        scope: "creatorsapi::default",
        client_id: s.api_key,
        client_secret: s.api_secret,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.access_token) {
      return { ok: true, message: "Amazon OK — token gerado com sucesso" };
    }
    return { ok: false, message: `Amazon recusou: ${data.error_description || data.error || res.status}` };
  } catch (e) {
    return { ok: false, message: `Erro de rede: ${e instanceof Error ? e.message : e}` };
  }
}

// ── Shopee: GraphQL com assinatura SHA256(appId+timestamp+body+appSecret) ──
async function testShopee(s: PlatformSecrets): Promise<TestResult> {
  if (!s.api_key || !s.api_secret) return { ok: false, message: "Faltam App ID e App Secret" };
  try {
    const appId = s.api_key;
    const appSecret = s.api_secret;
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      query: "query{shopeeOfferV2(limit:1){nodes{commissionRate}}}",
    });
    const signBase = `${appId}${timestamp}${body}${appSecret}`;
    const signature = crypto.createHash("sha256").update(signBase).digest("hex");
    const res = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`,
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.errors) {
      return { ok: true, message: "Shopee OK — API respondeu autenticada" };
    }
    const err = data.errors?.[0]?.message || data.error || res.status;
    return { ok: false, message: `Shopee recusou: ${err}` };
  } catch (e) {
    return { ok: false, message: `Erro de rede: ${e instanceof Error ? e.message : e}` };
  }
}

// ── Mercado Livre: valida presença do cookie + tag (teste real de sessão é frágil) ──
async function testML(s: PlatformSecrets): Promise<TestResult> {
  if (!s.cookie) return { ok: false, message: "Falta o cookie de sessão do ML" };
  if (!s.tag) return { ok: false, message: "Falta a tag de afiliado (ex: BRUNOTROPOLIS)" };
  // Teste leve: bate na API pública do ML pra confirmar conectividade.
  // (Validar o cookie de verdade exige gerar um link — feito no coletor.)
  try {
    const res = await fetch("https://api.mercadolibre.com/sites/MLB", { method: "GET" });
    if (res.ok) {
      return { ok: true, message: "Cookie e tag salvos. Validação real do cookie acontece no 1º link gerado." };
    }
    return { ok: false, message: `ML indisponível agora (${res.status})` };
  } catch (e) {
    return { ok: false, message: `Erro de rede: ${e instanceof Error ? e.message : e}` };
  }
}

export async function testPlatform(platform: string, s: PlatformSecrets): Promise<TestResult> {
  switch (platform) {
    case "amazon": return testAmazon(s);
    case "shopee": return testShopee(s);
    case "ml":     return testML(s);
    default:       return { ok: false, message: "Plataforma desconhecida" };
  }
}
