import json, os, base64, asyncio
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
M = [  # 12/Nov: aviso diário dos grupos secundários (fraldas f1-f5, cupons k1-k5) na geral das Maternas
 ("f1","m_presentes","GRUPO DE FRALDAS","Fralda<br>barata","Um grupo só de ofertas de fralda e lenço, das melhores marcas","é de graça, entra pelo link","c"),
 ("f2","m_cupons","PRA QUEM COMPRA TODO MÊS","Huggies e<br>Pampers","Os melhores preços de fralda chegam primeiro no grupo de fraldas","é de graça, entra pelo link","c"),
 ("f3","m_relogio","ACABOU A FRALDA?","Não pague<br>caro","No grupo de fraldas a gente avisa quando o preço cai","é de graça, entra pelo link","c"),
 ("f4","m_amigas","MÃE AJUDA MÃE","Grupo de<br>Fraldas","Chama quem também vive comprando fralda","é de graça, entra pelo link","t"),
 ("f5","m_presentes","ECONOMIA DE VERDADE","Pacotão em<br>oferta","Do RN ao XXG, das melhores marcas, no grupo de fraldas","é de graça, entra pelo link","c"),
 ("k1","m_cupons","GRUPO DE CUPONS","Só<br>cupons","Cupons da Shopee, Mercado Livre e Amazon assim que saem","é de graça, entra pelo link","c"),
 ("k2","m_relogio","CUPOM ACABA RÁPIDO","Chega<br>primeiro","No grupo de cupons você recebe o código na hora","é de graça, entra pelo link","c"),
 ("k3","m_presentes","ANTES DE COMPRAR","Tem<br>cupom?","Confere no nosso grupo de cupons e paga menos","é de graça, entra pelo link","c"),
 ("k4","m_amigas","MÃE ESPERTA","Grupo de<br>Cupons","Desconto extra nas compras do bebê e da casa","é de graça, entra pelo link","t"),
 ("k5","m_cupons","ECONOMIZA MAIS","Cupom +<br>oferta","Junta o cupom do grupo com as ofertas daqui e paga bem menos","é de graça, entra pelo link","c"),
]
G = []
LOGO = b64("../1111/logo_m.jpg")
def html_m(fundo,pill,big,sub,foot,lay):
    bigsz = 300 if big=="11.11" else (128 if "<br>" in big else (128 if big=="Amanhã, 6h" else (150 if len(big)<=10 else 110)))
    top = "padding-top:64px;justify-content:flex-start" if lay=="t" else "justify-content:center"
    w = "760px" if lay=="t" else "640px"
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;background:url('{b64("../1111/fundos/"+fundo+".png")}') center/cover;font-family:Fredoka,sans-serif;display:flex;flex-direction:column;align-items:center;{top};text-align:center;position:relative}}
.pill{{background:#1FB89A;color:#fff;font-weight:700;font-size:40px;letter-spacing:2px;padding:14px 38px;border-radius:60px;box-shadow:0 6px 0 #138a72}}
.big{{font-weight:700;font-size:{bigsz}px;line-height:1;color:#EE5FB8;margin:{18 if lay=='t' else 26}px 0 {12 if lay=='t' else 18}px;text-shadow:0 8px 0 #c94a99, 0 14px 30px rgba(200,70,150,.25);letter-spacing:-2px}}
.sub{{font-weight:600;font-size:{46 if lay=='t' else 50}px;line-height:1.15;color:#5a2b52;max-width:{w}}}
.foot{{margin-top:30px;font-weight:600;font-size:36px;color:#fff;background:#EE5FB8;padding:12px 32px;border-radius:50px}}
.logo{{position:absolute;bottom:34px;left:34px;width:120px;height:120px;border-radius:26px;box-shadow:0 6px 16px rgba(0,0,0,.12);background:url('{LOGO}') center/cover}}
</style></head><body><div class=pill>{pill}</div><div class=big>{big}</div><div class=sub>{sub}</div><div class=foot>{foot}</div>{'<div class=logo></div>' if lay!='t' else '<div class=logo style="left:auto;right:34px;top:34px;bottom:auto"></div>'}</body></html>"""
def html_g(fundo,pill,big,sub,foot):
    bigsz = 320 if big=="11.11" else (190 if len(big)<=10 else 140)
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@600;800&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;background:url('{b64("../1111/fundos/"+fundo+".png")}') center/cover;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;font-family:Poppins}}
body:before{{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(20,10,46,.75) 0,rgba(20,10,46,.35) 45%,transparent 70%)}}
*>*{{position:relative}}
.pill{{background:#FF2E93;color:#fff;font-weight:800;font-size:38px;letter-spacing:3px;padding:12px 34px;border-radius:8px;box-shadow:0 0 30px #FF2E93}}
.big{{font-family:Anton;font-size:{bigsz}px;line-height:1.02;color:#FFD23F;margin:24px 0 14px;text-shadow:0 0 18px rgba(255,210,63,.7),6px 6px 0 #000;-webkit-text-stroke:3px #000;max-width:960px}}
.sub{{font-weight:600;font-size:46px;line-height:1.18;color:#fff;max-width:700px;text-shadow:0 2px 10px #000}}
.foot{{margin-top:28px;font-weight:800;font-size:34px;color:#140A2E;background:#33D1FF;padding:10px 30px;border-radius:8px;box-shadow:0 0 24px #33D1FF}}
.marca{{position:absolute;top:36px;left:40px;font-family:Anton;font-size:40px;color:#fff;letter-spacing:2px;text-shadow:0 0 12px #FF2E93}}
.marca b{{color:#FFD23F}}
</style></head><body><div class=marca>BUSCADOR <b>GEEK</b></div><div class=pill>{pill}</div><div class=big>{big}</div><div class=sub>{sub}</div><div class=foot>{foot}</div></body></html>"""
async def main():
    os.makedirs("../../public/avisos/grupos",exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1080,"height":1080})
        for a in M:
            await pg.set_content(html_m(*a[1:])); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"../../public/avisos/grupos/{a[0]}.jpg",type="jpeg",quality=88)
        for a in G:
            await pg.set_content(html_g(*a[1:])); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"../../public/avisos/grupos/{a[0]}.jpg",type="jpeg",quality=88)
        await b.close()
asyncio.run(main())
from PIL import Image
ids=[a[0] for a in M]; W=360
im=Image.new("RGB",(W*5,W*2),"white")
for i,f in enumerate(ids): im.paste(Image.open(f"../../public/avisos/grupos/{f}.jpg").resize((W,W)),((i%5)*W,(i//5)*W))
im.save("folha_artes.jpg",quality=82)
print("ok",len(ids))
