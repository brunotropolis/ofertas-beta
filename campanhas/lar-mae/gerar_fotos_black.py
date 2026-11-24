# 24/11: fotos com clima de Black Friday (fundo escuro, luz dramática) pras artes de convite Lar/Mãe de 25 a 27/11.
import json, base64, urllib.request, os, concurrent.futures as cf
env = dict(l.split("=",1) for l in open("D:/CLAUDE/.env.meta",encoding="utf8").read().splitlines() if "=" in l and not l.startswith("#"))
KEY = env["OPENROUTER_API_KEY"].strip().strip('"')
FOTO = ("Photorealistic premium product photograph, dramatic studio lighting on a deep black background, glossy reflections, Black Friday sale mood, "
        "all objects physically correct, no people, no hands. Absolutely no text, letters, numbers, logos or labels anywhere, plain unbranded packaging. Square image.")
P = {
 "xl1": "Plain white bottles of laundry detergent and fabric softener with a big black satin gift bow, mint green rim light, black shopping bag beside them.",
 "xl2": "A stack of plain laundry products, a box of washing powder and folded fresh towels arranged like a sale display on a black glossy surface, mint green neon glow behind.",
 "xl3": "A single black nonstick frying pan with a straight black handle lying flat next to two plain white spray bottles standing upright, on a black glossy surface, a gold ribbon curl and a few confetti, mint green accent light, simple clean composition.",
 "xm1": "Elegant skincare bottles and jars in plain frosted glass with a black satin gift bow, hot pink rim light, a small black shopping bag beside them.",
 "xm2": "Three lipsticks standing upright side by side with caps off showing smooth intact pink and red bullets, and two nail polish bottles standing beside them, on a black glossy surface, hot pink neon glow behind, simple clean composition.",
 "xm3": "A plain frosted glass jar of face cream and a plain pump bottle of body oil standing side by side on a black glossy surface with a black satin ribbon, a few pink rose petals, hot pink accent light, simple clean composition.",
}
os.makedirs("fotos", exist_ok=True)
def gen(nome):
    out=f"fotos/{nome}.png"
    if os.path.exists(out): return nome,"ja existe"
    body=json.dumps({"model":"openai/gpt-image-2","prompt":P[nome]+" "+FOTO,"aspect_ratio":"1:1","quality":"medium","output_format":"png"}).encode()
    req=urllib.request.Request("https://openrouter.ai/api/v1/images",body,{"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    try: j=json.load(urllib.request.urlopen(req,timeout=300))
    except urllib.error.HTTPError as e: return nome,"ERRO "+e.read().decode()[:200]
    img=j["data"][0]
    raw=base64.b64decode(img["b64_json"]) if img.get("b64_json") else urllib.request.urlopen(img["url"]).read()
    open(out,"wb").write(raw); return nome,f"ok custo={j.get('usage',{}).get('cost')}"
with cf.ThreadPoolExecutor(3) as ex:
    for r in ex.map(gen,P): print(*r,flush=True)
