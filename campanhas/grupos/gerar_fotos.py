# 12/Nov: fotos realistas (Seedream 5 Pro via OpenRouter) pras artes dos grupos de Fraldas (azul) e Cupons (laranja)
import json, base64, urllib.request, os, concurrent.futures as cf
env = dict(l.split("=",1) for l in open("D:/CLAUDE/.env.meta",encoding="utf8").read().splitlines() if "=" in l and not l.startswith("#"))
KEY = env["OPENROUTER_API_KEY"].strip().strip('"')
FOTO = "Professional realistic lifestyle photograph, natural soft daylight, shallow depth of field, Brazilian home, warm and clean, high detail, square. Absolutely no text, no letters, no numbers, no brand logos, no watermark, plain unbranded packaging. No baby bottles."
P = {
 "f1": "Several big plain white and light blue diaper packs neatly stacked on a white nursery shelf next to a pack of baby wipes, soft blue tones.",
 "f2": "Close up of a mother's hands fastening a clean white disposable diaper on a baby lying on a soft light blue changing mat, baby face not visible, only torso and legs, tender moment.",
 "f3": "A supermarket shopping cart filled with large unbranded diaper packs and baby wipes, in a bright store aisle, blue tones.",
 "f4": "A woven basket with neatly rolled white disposable diapers and a pack of baby wipes on a light blue blanket in a cozy nursery.",
 "f5": "Cute baby feet on a soft white blanket next to a folded clean disposable diaper, top view, soft blue and white tones.",
 "k1": "A smartphone lying on a table next to colorful paper discount coupons and a small shopping cart toy, warm orange and yellow tones, screen dark and blank.",
 "k2": "A smiling Brazilian woman sitting on a sofa holding a smartphone and a credit card, shopping online, warm orange light, cozy living room.",
 "k3": "Colorful shopping bags and gift boxes with blank paper price tags on a bright table, orange and yellow tones, festive.",
 "k4": "A happy Brazilian mother with her baby on her lap looking at a smartphone screen and smiling, warm orange afternoon light, cozy home.",
 "k5": "Several cardboard delivery boxes at the front door of a home, with baby clothes and a plush toy peeking out of one box, warm orange tones.",
}
def gen(nome):
    out=f"fotos/{nome}.png"
    if os.path.exists(out): return nome,"ja existe"
    body=json.dumps({"model":"bytedance-seed/seedream-5-0-pro","prompt":P[nome]+" "+FOTO,"aspect_ratio":"1:1","resolution":"1K"}).encode()
    req=urllib.request.Request("https://openrouter.ai/api/v1/images",body,{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    try: j=json.load(urllib.request.urlopen(req,timeout=240))
    except urllib.error.HTTPError as e: return nome,"ERRO "+e.read().decode()[:300]
    img=j["data"][0]
    raw=base64.b64decode(img["b64_json"]) if img.get("b64_json") else urllib.request.urlopen(img["url"]).read()
    open(out,"wb").write(raw); return nome,f"ok custo={j.get('usage',{}).get('cost')}"
with cf.ThreadPoolExecutor(5) as ex:
    for r in ex.map(gen,P): print(*r,flush=True)
