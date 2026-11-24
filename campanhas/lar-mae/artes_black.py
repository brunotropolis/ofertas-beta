# 24/11: artes de convite com pegada de Black Friday (25 a 27/11) pros grupos Lar e Mãe. Saída: artes/x*.jpg (rascunho pra aprovação).
import os, base64, asyncio
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
PAL = {
 "l": dict(cor="#1FD1A8", cor2="#0E8F72", grupo="OFERTAS MATERNAS PARA O LAR", logo="logos/lar_b2.png"),
 "m": dict(cor="#FF4FA8", cor2="#C2367F", grupo="OFERTAS MATERNAS PARA MÃE", logo="logos/mae_b1.png"),
}
A = [  # id, contagem, linha grande, frase
 ("xl1","FALTAM 2 DIAS","da casa","Sabão, amaciante e limpeza em oferta"),
 ("xl2","É AMANHÃ","da casa","Faça o estoque do mês pagando menos"),
 ("xl3","É HOJE","da casa","As melhores ofertas pro lar estão no grupo"),
 ("xm1","FALTAM 2 DIAS","da mãe","Beleza, cabelo e unhas com preço de Black"),
 ("xm2","É AMANHÃ","da mãe","Maquiagem e esmalte com desconto"),
 ("xm3","É HOJE","da mãe","As melhores ofertas de beleza estão no grupo"),
]
def html(id,cont,linha,frase):
    p = PAL[id[1]]; foto = b64(f"fotos/{id}.png"); logo = b64(p["logo"])
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Anton&family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;position:relative;overflow:hidden;background:#0A0A0A;font-family:Fredoka,sans-serif}}
.foto{{position:absolute;top:0;left:0;width:1080px;height:560px;background:url('{foto}') center 50%/cover}}
.fade{{position:absolute;top:360px;left:0;width:1080px;height:220px;background:linear-gradient(180deg,rgba(10,10,10,0),#0A0A0A)}}
.cont{{position:absolute;top:36px;left:36px;background:#FFD43B;color:#111;font-weight:700;font-size:40px;letter-spacing:1px;padding:12px 30px;border-radius:14px;transform:rotate(-3deg);box-shadow:0 8px 24px rgba(0,0,0,.4)}}
.logo{{position:absolute;top:24px;right:24px;width:170px;height:170px;border-radius:50%;background:url('{logo}') center/118%;border:4px solid {p['cor']};box-shadow:0 0 30px {p['cor']}88}}
.painel{{position:absolute;top:520px;left:0;width:1080px;display:flex;flex-direction:column;align-items:center;text-align:center}}
.black{{font-family:Anton,sans-serif;font-size:150px;line-height:.95;color:#fff;letter-spacing:2px}}
.black span{{color:{p['cor']};text-shadow:0 0 28px {p['cor']}99}}
.linha{{font-family:Anton,sans-serif;font-size:96px;line-height:1;color:{p['cor']};text-transform:uppercase;letter-spacing:3px;margin-top:2px}}
.frase{{font-weight:500;font-size:50px;line-height:1.12;color:#FFFFFF;max-width:920px;margin-top:18px}}
.btn{{margin-top:26px;background:{p['cor']};color:#0A0A0A;font-weight:700;font-size:42px;padding:14px 44px;border-radius:60px}}
.grupo{{position:absolute;bottom:22px;left:0;width:1080px;text-align:center;color:#9A9A9A;font-weight:600;font-size:30px;letter-spacing:3px}}
</style></head><body><div class=foto></div><div class=fade></div><div class=cont>{cont}</div><div class=logo></div>
<div class=painel><div class=black>BLACK <span>FRIDAY</span></div><div class=linha>{linha}</div><div class=frase>{frase}</div><div class=btn>Entra no grupo, é de graça</div></div>
<div class=grupo>{p['grupo']}</div></body></html>"""
async def main():
    os.makedirs("artes",exist_ok=True)
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); pg=await b.new_page(viewport={"width":1080,"height":1080})
        for a in A:
            await pg.set_content(html(*a)); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"artes/{a[0]}.jpg",type="jpeg",quality=88)
        await b.close()
asyncio.run(main())
from PIL import Image
W=400; im=Image.new("RGB",(W*3,W*2),"white")
for i,a in enumerate(A): im.paste(Image.open(f"artes/{a[0]}.jpg").resize((W,W)),((i%3)*W,(i//3)*W))
im.save("folha_artes_black.jpg",quality=86); print("ok")
