// Teste local do leitor (dry-run por padrão): node scripts/telegram-leitor.test.cjs [horas] [--ingest]
const crypto = require("crypto");
const fs = require("fs");
const { runLeitor } = require("./telegram-leitor.core.js");
const env = Object.fromEntries(fs.readFileSync("D:/CLAUDE/.env.meta", "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1")]; }));
const http = async ({ url, method = "GET", headers = {}, body, manual }) => {
  const r = await fetch(url, { method, headers, body, redirect: manual ? "manual" : "follow" });
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() };
};
(async () => {
  const hours = +(process.argv[2] || 12);
  const res = await runLeitor({
    http, sha256: (s) => crypto.createHash("sha256").update(s).digest("hex"), state: {}, kw: [],
    cfg: {
      channels: ["grupo_promocoes", "amigacompra", "promocaozinha", "cuponsm", "afiliadosshopeebroficial", "cuponsdasho", "fadadoscupons"],
      shopee: { appId: env.SHOPEE_APP_ID, secret: env.SHOPEE_APP_SECRET },
      ml: { cookie: env.ML_COOKIE_MATERNA, csrf: "Mqp1xO_51aAxfOR-BiDjSQnt", tag: "manualmanual20230331072922", social: "https://www.mercadolivre.com.br/social/manualdorecemnascido" },
      amazonTag: "manualdorec0c-20", firstRunHours: hours,
    },
  });
  const { enviados, ...resto } = res;
  console.log(JSON.stringify(resto));
  for (const e of enviados) console.log(`[${e.kind}] ${e.source_channel} ${e.platform} | ${e.title} | R$${e.price_current ?? "-"} | ${e.coupon_code ?? ""} | ${e.affiliate_url} | img:${!!e.image_url}`);
  fs.writeFileSync(process.env.OUT || "tg-dryrun.json", JSON.stringify(enviados, null, 1));
})();
