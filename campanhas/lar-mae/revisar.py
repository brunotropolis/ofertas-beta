# Gemini como diretor de arte: revisa uma imagem com um briefing. Uso: python revisar.py <imagem> "<briefing>"
import sys, json, base64, urllib.request
env = dict(l.split("=", 1) for l in open("D:/CLAUDE/.env.meta", encoding="utf8").read().splitlines() if "=" in l and not l.startswith("#"))
KEY = env["GEMINI_API_KEY"].strip().strip('"')
img, brief = sys.argv[1], sys.argv[2]
mime = "image/png" if img.endswith("png") else "image/jpeg"
body = {"contents": [{"parts": [
    {"inline_data": {"mime_type": mime, "data": base64.b64encode(open(img, "rb").read()).decode()}},
    {"text": "Você é diretor de arte sênior. " + brief + " Responda em português, curto: nota de 0 a 10 por peça, problemas concretos (grafia, legibilidade em tamanho pequeno de foto de grupo de WhatsApp, contraste, se parece da mesma família da marca) e o que ajustar. Seja crítico."}]}]}
for model in ["gemini-3.1-pro-preview", "gemini-2.5-pro"]:
    try:
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}", json.dumps(body).encode(), {"Content-Type": "application/json"})
        j = json.load(urllib.request.urlopen(req, timeout=180))
        print(f"[{model}]\n" + j["candidates"][0]["content"]["parts"][-1]["text"]); break
    except Exception as e:
        print(model, "falhou:", str(e)[:150])
