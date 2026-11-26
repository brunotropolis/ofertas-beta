// 26/Nov: grava a sessão ML da conta do Manual (cofre ML_COOKIE_MATERNA) no slot da campanha LAR, lido pelo encurtador
import fs from "node:fs";
const E = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]));
const K = E.SUPABASE_SERVICE_ROLE_OFERTAS_BETA, U = "https://qkherjtsvakmpkxebuwy.supabase.co/rest/v1/rpc/";
const h = { apikey: K, Authorization: "Bearer " + K, "content-type": "application/json" };
const r = await fetch(U + "save_platform_creds", { method: "POST", headers: h, body: JSON.stringify({ p_campaign_id: "6ce489b0-dcfe-4726-a4a8-83eb6ba7ca21", p_platform: "ml", p_cookie: E.ML_COOKIE_MATERNA }) });
console.log("save", r.status, (await r.text()).slice(0, 200));
const g = await (await fetch(U + "get_platform_secrets", { method: "POST", headers: h, body: JSON.stringify({ p_campaign_id: "6ce489b0-dcfe-4726-a4a8-83eb6ba7ca21", p_platform: "ml" }) })).json();
console.log("lido", (Array.isArray(g) ? g[0] : g)?.cookie?.length === E.ML_COOKIE_MATERNA.length);
