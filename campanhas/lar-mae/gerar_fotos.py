# 24/11: fotos realistas (Seedream 5 Pro via OpenRouter) pras artes de convite dos grupos Lar (verde) e Mãe (rosa).
# b = até a Black (25 a 27/11), l/m = depois da Black (a partir de 30/11).
import json, base64, urllib.request, os, concurrent.futures as cf
env = dict(l.split("=",1) for l in open("D:/CLAUDE/.env.meta",encoding="utf8").read().splitlines() if "=" in l and not l.startswith("#"))
KEY = env["OPENROUTER_API_KEY"].strip().strip('"')
FOTO = "Professional realistic lifestyle photograph, natural soft daylight, shallow depth of field, Brazilian home, warm and clean, high detail, square. Absolutely no text, no letters, no numbers, no brand logos, no watermark, plain unbranded packaging and bottles. No baby bottles."
P = {
 "lb1": "A bright clean laundry corner with plain white bottles of liquid detergent and fabric softener on a shelf, a basket of fresh folded towels, soft mint green tones.",
 "lb2": "Big plain bottles of laundry detergent and fabric softener in a shopping basket in a bright store aisle, festive shopping mood, mint green and white tones.",
 "lb3": "A tidy modern Brazilian kitchen counter with cleaning sprays, sponges, microfiber cloths and a small plant, sunlight, mint green accents, celebratory clean home feeling.",
 "l1": "A smiling Brazilian mother folding fresh clean laundry on a bed, sunlight, mint green and white tones, cozy home.",
 "l2": "Close up of plain white boxes and bottles of laundry powder and liquid detergent next to a washing machine, mint green tones, clean and bright.",
 "l3": "A neat kitchen with nonstick pans, glass storage containers and kitchen utensils on the counter, warm daylight, mint green accents.",
 "l4": "A cozy clean living room with a vacuum, a bucket with cleaning products and a soft rug, sunlight, mint green and cream tones.",
 "l5": "Two Brazilian mothers laughing together in a bright kitchen, holding smartphones, home cleaning products on the counter, mint green tones.",
 "mb1": "A Brazilian woman in her thirties gently applying face cream in front of a bathroom mirror, soft pink tones, self care moment, plain unbranded jars.",
 "mb2": "Skincare products in plain pink and white bottles and jars, sunscreen and body oil arranged on a vanity with flowers, soft pink tones, festive.",
 "mb3": "An open pink makeup bag on a vanity with lipsticks, nail polish bottles and a hair brush, a small gift bow, soft pink festive mood.",
 "m1": "A relaxed Brazilian mother with a towel on her hair smiling with eyes closed, applying body lotion, soft pink morning light, cozy bathroom.",
 "m2": "Hair care kit in plain unbranded bottles, a wide tooth comb and a curly hair cream jar on a pink vanity, soft pink tones.",
 "m3": "Close up of a woman's hands with freshly painted pink nails holding a nail polish bottle, soft pink background.",
 "m4": "A Brazilian mother with her sleeping baby on her chest, a plain jar of body oil and a cream on the nightstand beside her, soft pink tender light.",
 "m5": "Two Brazilian women friends smiling and doing skincare together, sheet masks and plain jars, soft pink tones, cozy home.",
}
os.makedirs("fotos", exist_ok=True)
def gen(nome):
    out=f"fotos/{nome}.png"
    if os.path.exists(out): return nome,"ja existe"
    body=json.dumps({"model":"bytedance-seed/seedream-5-0-pro","prompt":P[nome]+" "+FOTO,"aspect_ratio":"1:1","resolution":"1K"}).encode()
    req=urllib.request.Request("https://openrouter.ai/api/v1/images",body,{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    try: j=json.load(urllib.request.urlopen(req,timeout=240))
    except urllib.error.HTTPError as e: return nome,"ERRO "+e.read().decode()[:200]
    img=j["data"][0]
    raw=base64.b64decode(img["b64_json"]) if img.get("b64_json") else urllib.request.urlopen(img["url"]).read()
    open(out,"wb").write(raw); return nome,f"ok custo={j.get('usage',{}).get('cost')}"
with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(gen,P): print(*r,flush=True)
