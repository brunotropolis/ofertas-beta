import json, base64, urllib.request, os, sys, concurrent.futures as cf
env = dict(l.split("=",1) for l in open("D:/CLAUDE/.env.meta",encoding="utf8").read().splitlines() if "=" in l and not l.startswith("#"))
KEY = env["OPENROUTER_API_KEY"].strip().strip('"')
NOTXT = " Absolutely no text, no letters, no numbers, no logos, no watermark. Leave a large clean empty area in the center for text overlay."
M = "Soft pastel pink background (#FCE4F0), flat cute vector illustration style, mint green (#1FB89A) and pink (#F07CC8) accents, gentle and cozy, square composition."
G = "Dark indigo background (#140A2E), neon synthwave style, glowing magenta (#FF2E93), sunny yellow (#FFD23F) and cyan (#33D1FF) light accents, vibrant and energetic, square composition."
P = {
 "m_presentes": M+" Gift boxes with ribbons, shopping bags and little baby items (tiny socks, teddy bear, diaper pack, baby onesie, rattle). No baby bottles at all scattered around the edges, confetti and sparkles.",
 "m_relogio": M+" A cute alarm clock ringing at the edge, small sun rising, sparkles and hearts floating, baby clothes on a tiny clothesline at the top edge.",
 "m_cupons": M+" Cute discount coupon tickets and price tags flying around the edges, a pink shopping cart full of baby products (diapers, wipes, plush toy), confetti.",
 "m_amigas": M+" Two happy mothers silhouettes (one pregnant) hugging seen from behind, smartphones with hearts flying between them, at the bottom edge, hearts and sparkles.",
 "g_presentes": G+" Glowing gift boxes, a game controller, wireless headphones, a smartwatch and a smartphone floating around the edges, neon grid floor, sparkles.",
 "g_relogio": G+" A retro digital alarm clock glowing at the edge, neon sunrise over a grid horizon, lightning sparks.",
 "g_cupons": G+" Neon discount coupon tickets and price tags flying around the edges, a glowing shopping cart with gadgets (air fryer, robot vacuum, console), electric sparks.",
 "g_alerta": G+" A big glowing notification bell and a smartphone with notification bursts at the edges, neon rays and sparks.",
}
def gen(nome):
    out=f"fundos/{nome}.png"
    if os.path.exists(out): return nome,"ja existe"
    body=json.dumps({"model":"bytedance-seed/seedream-5-0-pro","prompt":P[nome]+NOTXT,"aspect_ratio":"1:1","resolution":"1K"}).encode()
    req=urllib.request.Request("https://openrouter.ai/api/v1/images",body,{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    try:
        j=json.load(urllib.request.urlopen(req,timeout=240))
    except urllib.error.HTTPError as e:
        return nome, "ERRO "+e.read().decode()[:300]
    img=j["data"][0]
    raw=base64.b64decode(img["b64_json"]) if img.get("b64_json") else urllib.request.urlopen(img["url"]).read()
    open(out,"wb").write(raw); return nome, f"ok {len(raw)//1024}KB custo={j.get('usage',{}).get('cost')}"
with cf.ThreadPoolExecutor(4) as ex:
    for r in ex.map(gen, P): print(*r, flush=True)
