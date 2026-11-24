# 24/11 v2: refaz no GPT-Image 2 as fotos que o Gemini reprovou (mãos, objetos deformados, foto que não casava com o texto).
import json, base64, urllib.request, os, concurrent.futures as cf
env = dict(l.split("=",1) for l in open("D:/CLAUDE/.env.meta",encoding="utf8").read().splitlines() if "=" in l and not l.startswith("#"))
KEY = env["OPENROUTER_API_KEY"].strip().strip('"')
FOTO = ("Photorealistic lifestyle photograph shot on a full-frame camera, natural soft daylight, shallow depth of field, Brazilian home, clean and warm. "
        "All objects physically correct and realistic, correct anatomy, natural hands with five fingers if hands appear, no melted or fused shapes. "
        "Absolutely no text, letters, numbers, logos or labels anywhere, plain unbranded packaging. No baby bottles. Square image.")
P = {
 "lb2": "Two plain white bottles of liquid laundry detergent and one plain light green bottle of fabric softener standing inside a simple green plastic laundry basket on a bright tiled laundry room floor, fresh folded towels beside them, mint green tones.",
 "lb3": "A tidy bright Brazilian kitchen counter with two plain white spray bottles standing upright, a yellow sponge, folded microfiber cloths and a small potted plant, sunlight, mint green accents.",
 "l1": "A neat stack of fresh fluffy folded white and mint green towels on a made bed with white linen, sunlight through the window, mint green and white bedroom, no people.",
 "l2": "A large plain white cardboard box of washing powder standing in the foreground, front facing, with a measuring scoop of white detergent powder beside it on a white shelf, a front-loading washing machine softly blurred behind, mint green laundry room, no people.",
 "l3": "Two stainless nonstick frying pans and a pot with lids neatly placed on a modern stovetop, glass food storage containers and wooden spoons on the counter, warm daylight, mint green kitchen.",
 "l4": "A clean bright living room with a modern cordless stick vacuum cleaner leaning against the sofa and a small basket with plain cleaning bottles on the floor, sunlight, mint green and cream tones.",
 "l5": "Two Brazilian mothers standing side by side in a bright kitchen smiling warmly at the camera, shown from the chest up, arms relaxed down, hands not visible, plain cleaning bottles on the counter behind them, mint green tones.",
 "mb2": "Elegant skincare products in plain frosted glass bottles and jars, a pump bottle of body oil and a tube of sunscreen arranged on a marble vanity tray with pink flowers, soft pink tones.",
 "mb3": "Flat lay top-down view on a white table: an open pink cosmetic bag, three lipsticks lying side by side, two nail polish bottles, a compact powder and a makeup brush, neatly arranged, soft pink tones, no hands, no people.",
 "m1": "A Brazilian woman in her thirties wrapped in a white bathrobe applying moisturizer on her cheek with her fingertips, smiling at the mirror, soft pink morning light, bathroom.",
 "m2": "Plain pink and white shampoo and conditioner bottles, a jar of hair mask and a wide-tooth comb arranged on a white vanity with a pink towel, soft pink tones.",
 "m3": "Three nail polish bottles in shades of pink and nude standing on a white table next to a small vase with pink flowers and a nail file, soft pink tones, no hands.",
 "m4": "A Brazilian mother seen from behind sitting by a sunny window holding her baby wrapped in a soft pink blanket against her shoulder, baby face not visible, a jar of body cream and a small plant on the windowsill, soft pink tender light.",
}
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
