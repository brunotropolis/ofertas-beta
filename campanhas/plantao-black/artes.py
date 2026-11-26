# 26/11 (Bruno: "disparar alguns avisos hoje nos grupos falando que amanhã vamos fazer plantão da black")
# Mesmo molde das artes do 11.11 (fundos Seedream já pagos, texto por cima em HTML).
import os, base64, asyncio
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
M = [
 ("p1","m_presentes","ANOTA AÍ, MAMÃE","PLANTÃO<br>DA BLACK","Amanhã tem ofertas e cupons o dia inteiro","das 6h à meia-noite"),
 ("p2","m_relogio","É AMANHÃ!","BLACK<br>FRIDAY","Nossa equipe de plantão caçando as melhores ofertas pra você","a partir das 6h"),
 ("p3","m_cupons","ÚLTIMA CHAMADA","Amanhã, 6h","Começa o plantão da Black das Ofertas Maternas","ativa as notificações do grupo"),
]
LOGO = b64("logo_m.jpg")
def html(fundo,pill,big,sub,foot):
    pad = "padding-top:150px" if fundo=="m_relogio" else ("padding-bottom:60px" if fundo=="m_cupons" else "")
    subw = 600 if fundo=="m_cupons" else 660
    bigsz = 150 if "<br>" in big else 128
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;background:url('{b64("fundos/"+fundo+".png")}') center/cover;font-family:Fredoka,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;{pad}}}
.pill{{background:#1FB89A;color:#fff;font-weight:700;font-size:40px;letter-spacing:2px;padding:14px 38px;border-radius:60px;box-shadow:0 6px 0 #138a72}}
.big{{font-weight:700;font-size:{bigsz}px;line-height:.98;color:#EE5FB8;margin:26px 0 18px;text-shadow:0 8px 0 #c94a99, 0 14px 30px rgba(200,70,150,.25);letter-spacing:-2px}}
.sub{{font-weight:600;font-size:48px;line-height:1.15;color:#5a2b52;max-width:{subw}px}}
.foot{{margin-top:30px;font-weight:600;font-size:36px;color:#fff;background:#EE5FB8;padding:12px 32px;border-radius:50px}}
.logo{{position:absolute;bottom:34px;left:34px;width:120px;height:120px;border-radius:26px;box-shadow:0 6px 16px rgba(0,0,0,.12);background:url('{LOGO}') center/cover}}
</style></head><body><div class=pill>{pill}</div><div class=big>{big}</div><div class=sub>{sub}</div><div class=foot>{foot}</div><div class=logo></div></body></html>"""
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
