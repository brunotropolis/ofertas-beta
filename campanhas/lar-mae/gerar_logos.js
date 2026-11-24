// 24/11 (Bruno): logos dos grupos novos "Ofertas Maternas para o Lar" e "Ofertas Maternas para Mãe".
// GPT-Image 2 via OpenRouter, usando a logo atual das Ofertas Maternas como referência de família (letra à mão, cegonha).
// Uso: node gerar_logos.js   (não regera arquivo que já existe)
const fs = require('fs'), path = require('path');
const env = Object.fromEntries(fs.readFileSync('D:/CLAUDE/.env.meta', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '').trim()]));
const K = env.OPENROUTER_API_KEY;
const ref = 'data:image/jpeg;base64,' + fs.readFileSync('D:/CLAUDE/ofertas-beta/campanhas/1111/logo_m.jpg').toString('base64');
const fam = 'Use the reference image as the brand family: same playful hand-drawn chunky lettering style, same cute flat illustration style, same soft pink background. It must look like a sister logo of the reference, not a copy. Square 1:1, centered, generous margins, flat vector illustration, crisp edges, no gradients noise, no extra words, no watermark. Spell every word exactly as written, Portuguese, no letters missing or added.';
const P = {
  lar_a: `Logo with three stacked lines of hand-drawn lettering: small "as ofertas" in teal green, big "maternas" in pink, and below "para o lar" in teal green. Under the text, the same cute pink stork flying and carrying in its beak a small bundle shaped like a tiny cozy house with a heart on the door. Palette teal green #19B394, pink #E879C6, soft mint accents, very light mint-pink background. ${fam}`,
  lar_b: `Round badge logo: a cute flat illustration of a small cozy house with a heart-shaped window, a little spray bottle and a folded towel beside it, inside a soft mint circle. Around/below it hand-drawn lettering "ofertas maternas" in pink and "para o lar" in teal green. Palette teal green #19B394, pink #E879C6, mint #DDF5EC, cream background. ${fam}`,
  mae_a: `Logo with three stacked lines of hand-drawn lettering: small "as ofertas" in teal green, big "maternas" in pink, and below "para mãe" in deep rose. Under the text, the same cute pink stork flying and carrying in its beak a small bundle with a tiny lipstick and a flower peeking out. Palette pink #E879C6, deep rose #C2417F, lilac #C9A7EB, teal green accent #19B394, very light pink background. Write "mãe" with the tilde. ${fam}`,
  mae_b: `Round badge logo: a cute flat illustration of a smiling mother's face in profile with long wavy hair, a small flower in the hair and a lipstick and nail polish bottle beside her, inside a soft lilac circle. Below it hand-drawn lettering "ofertas maternas" in pink and "para mãe" in deep rose. Palette pink #E879C6, deep rose #C2417F, lilac #E9DCFB, cream background. Write "mãe" with the tilde. ${fam}`,
};
const dir = path.join(__dirname, 'logos'); fs.mkdirSync(dir, { recursive: true });
(async () => {
  const jobs = [];
  for (const [nome, prompt] of Object.entries(P)) for (const v of [1, 2]) jobs.push([`${nome}${v}`, prompt]);
  for (const [nome, prompt] of jobs) await (async () => {
    const out = path.join(dir, nome + '.png'); if (fs.existsSync(out)) return console.log(nome, 'já existe');
    try {
      const r = await fetch('https://openrouter.ai/api/v1/images', { method: 'POST', headers: { Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai/gpt-image-2', prompt, aspect_ratio: '1:1', quality: 'medium', output_format: 'png', input_references: [{ type: 'image_url', image_url: { url: ref } }] }) });
      const j = await r.json(); const it = j.data?.[0]; if (!it) return console.log(nome, 'ERRO', JSON.stringify(j).slice(0, 300));
      const buf = it.b64_json ? Buffer.from(it.b64_json, 'base64') : Buffer.from(await (await fetch(it.url)).arrayBuffer());
      fs.writeFileSync(out, buf); console.log(nome, 'ok custo=', j.usage?.cost);
    } catch (e) { console.log(nome, 'ERRO', e.message); }
  })();
})();
