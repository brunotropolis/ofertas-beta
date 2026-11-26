# 26/11 (Bruno: "disparar alguns avisos hoje nos grupos falando que amanhã vamos fazer plantão da black";
# "tem que ser na cor da black"). Mesmo visual das artes Black do Lar/Mãe (fundo preto, Anton, rosa neon, selo amarelo).
import os, base64, asyncio, random
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
COR="#FF4FA8"
M = [  # id, selo, linha grande, frase, rodapé
 ("p1","ANOTA AÍ, MAMÃE","PLANTÃO","Amanhã tem ofertas e cupons o dia inteiro","das 6h à meia-noite"),
 ("p2","É AMANHÃ","COMEÇA ÀS 6H","Nossa equipe de plantão caçando as melhores ofertas pra você","não silencia o grupo"),
 ("p3","ÚLTIMA CHAMADA","AMANHÃ, 6H","Começa o plantão da Black das Ofertas Maternas","ativa as notificações"),
]
LOGO = b64("logo_m.jpg")
random.seed(7)
conf = "".join(f'<i style="left:{random.randint(0,1060)}px;top:{random.randint(0,1060)}px;width:{random.choice([6,8,10,14])}px;height:{random.choice([6,8,10,14])}px;background:{random.choice([COR,"#FFD43B","#ffffff55",COR+"99"])};transform:rotate({random.randint(0,90)}deg)"></i>' for _ in range(70))
def html(selo,linha,frase,foot):
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Anton&family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;position:relative;overflow:hidden;background:radial-gradient(circle at 50% 46%,#3a0d27 0,#140812 42%,#0A0A0A 70%);font-family:Fredoka,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}}
i{{position:absolute;border-radius:2px;opacity:.75}}
.selo{{position:absolute;top:40px;left:40px;background:#FFD43B;color:#111;font-weight:700;font-size:40px;letter-spacing:1px;padding:12px 30px;border-radius:14px;transform:rotate(-3deg);box-shadow:0 8px 24px rgba(0,0,0,.5)}}
.logo{{position:absolute;top:28px;right:28px;width:150px;height:150px;border-radius:32px;background:url('{LOGO}') center/cover;border:4px solid {COR};box-shadow:0 0 30px {COR}88}}
.black{{position:relative;font-family:Anton,sans-serif;font-size:190px;line-height:.92;color:#fff;letter-spacing:3px;margin-top:40px}}
.black span{{display:block;color:{COR};text-shadow:0 0 34px {COR}aa}}
.linha{{position:relative;font-family:Anton,sans-serif;font-size:96px;line-height:1;color:#FFD43B;letter-spacing:4px;margin-top:14px;text-shadow:0 0 20px #FFD43B55}}
.frase{{position:relative;font-weight:500;font-size:48px;line-height:1.14;color:#fff;max-width:880px;margin-top:22px}}
.foot{{position:relative;margin-top:28px;background:{COR};color:#0A0A0A;font-weight:700;font-size:40px;padding:12px 42px;border-radius:60px}}
.grupo{{position:absolute;bottom:24px;left:0;width:1080px;text-align:center;color:#9A9A9A;font-weight:600;font-size:28px;letter-spacing:4px}}
</style></head><body>{conf}<div class=selo>{selo}</div><div class=logo></div>
<div class=black>BLACK<span>FRIDAY</span></div><div class=linha>{linha}</div><div class=frase>{frase}</div><div class=foot>{foot}</div>
<div class=grupo>AS OFERTAS MATERNAS</div></body></html>"""
async def main():
    os.makedirs("artes",exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1080,"height":1080})
        for a in M:
            await pg.set_content(html(*a[1:])); await pg.wait_for_timeout(1800)
            await pg.screenshot(path=f"artes/{a[0]}.jpg",type="jpeg",quality=88)
        await b.close()
asyncio.run(main())
from PIL import Image
W=540; im=Image.new("RGB",(W*3,W),"white")
for i,a in enumerate(M): im.paste(Image.open(f"artes/{a[0]}.jpg").resize((W,W)),(i*W,0))
im.save("folha.jpg",quality=85); print("ok")
