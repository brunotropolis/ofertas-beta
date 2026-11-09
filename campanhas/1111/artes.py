import json, os, base64, asyncio
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
M = [  # id, fundo, pill, big, sub, foot, layout
 ("m1","m_presentes","ANOTA AÍ, MAMÃE","11.11","Ofertas exclusivas e cupons excelentes","das 6h à meia-noite","c"),
 ("m2","m_relogio","FALTAM 2 DIAS","11.11","Nossa equipe já está garimpando as melhores ofertas pra você","você vê aqui primeiro","c"),
 ("m3","m_presentes","É AMANHÃ!","11.11","Ofertas antecipadas a partir das 6h da manhã","ativa as notificações do grupo","c"),
 ("m4","m_cupons","PREPARA O CARRINHO","CUPONS","Excelentes, só no 11.11","amanhã, a partir das 6h","c"),
 ("m5","m_relogio","COMO VAI SER","6h às 24h","18 horas de ofertas exclusivas no 11.11","equipe caçando oferta o dia todo","c"),
 ("m6","m_cupons","SÓ AQUI NO GRUPO","Você vê<br>primeiro","As ofertas antecipadas do 11.11","amanhã às 6h","c"),
 ("m7","m_presentes","ÚLTIMA CHAMADA","Amanhã, 6h","Começa o 11.11 das Ofertas Maternas","deixa o celular por perto","c"),
 ("c1","m_amigas","CONVIDA UMA AMIGA","Mãe ajuda mãe","Chama as mães e gestantes que você conhece pro grupo","asofertasmaternas.com.br","t"),
 ("c2","m_amigas","TEM GESTANTE NA SUA VIDA?","Manda o link","Ela vai economizar no enxoval com a gente","asofertasmaternas.com.br","t"),
 ("c3","m_amigas","ANTES DO 11.11","Traz as amigas","Ofertas exclusivas pra elas também, de graça","asofertasmaternas.com.br","t"),
]
G = [
 ("g1","g_presentes","ANOTA AÍ","11.11","Ofertas exclusivas e cupons absurdos","das 6h à meia-noite"),
 ("g2","g_relogio","FALTAM 2 DIAS","11.11","Nossa equipe já está caçando as melhores ofertas","você vê aqui primeiro"),
 ("g3","g_alerta","É AMANHÃ","11.11","Ofertas antecipadas a partir das 6h","ativa as notificações"),
 ("g4","g_cupons","PREPARA O CARRINHO","CUPONS","Os melhores cupons do ano saem no 11.11","amanhã, a partir das 6h"),
 ("g5","g_relogio","COMO VAI SER","6h às 24h","18 horas de ofertas em tech, games e casa","equipe caçando oferta o dia todo"),
 ("g6","g_presentes","SÓ AQUI NO GRUPO","VOCÊ VÊ PRIMEIRO","As ofertas antecipadas do 11.11","amanhã às 6h"),
 ("g7","g_alerta","ÚLTIMA CHAMADA","AMANHÃ, 6H","Começa o 11.11 do Buscador Geek","deixa o celular por perto"),
]
LOGO = b64("logo_m.jpg")
def html_m(fundo,pill,big,sub,foot,lay):
    bigsz = 300 if big=="11.11" else (120 if "<br>" in big else (128 if big=="Amanhã, 6h" else (150 if len(big)<=10 else 110)))
    top = "padding-top:64px;justify-content:flex-start" if lay=="t" else "justify-content:center"
    w = "760px" if lay=="t" else "640px"
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;background:url('{b64("fundos/"+fundo+".png")}') center/cover;font-family:Fredoka,sans-serif;display:flex;flex-direction:column;align-items:center;{top};text-align:center;position:relative}}
.pill{{background:#1FB89A;color:#fff;font-weight:700;font-size:40px;letter-spacing:2px;padding:14px 38px;border-radius:60px;box-shadow:0 6px 0 #138a72}}
.big{{font-weight:700;font-size:{bigsz}px;line-height:1;color:#EE5FB8;margin:{18 if lay=='t' else 26}px 0 {12 if lay=='t' else 18}px;text-shadow:0 8px 0 #c94a99, 0 14px 30px rgba(200,70,150,.25);letter-spacing:-2px}}
.sub{{font-weight:600;font-size:{46 if lay=='t' else 50}px;line-height:1.15;color:#5a2b52;max-width:{w}}}
.foot{{margin-top:30px;font-weight:600;font-size:36px;color:#fff;background:#EE5FB8;padding:12px 32px;border-radius:50px}}
.logo{{position:absolute;bottom:34px;left:34px;width:120px;height:120px;border-radius:26px;box-shadow:0 6px 16px rgba(0,0,0,.12);background:url('{LOGO}') center/cover}}
</style></head><body><div class=pill>{pill}</div><div class=big>{big}</div><div class=sub>{sub}</div><div class=foot>{foot}</div>{'<div class=logo></div>' if lay!='t' else '<div class=logo style="left:auto;right:34px;top:34px;bottom:auto"></div>'}</body></html>"""
def html_g(fundo,pill,big,sub,foot):
    bigsz = 320 if big=="11.11" else (190 if len(big)<=10 else 140)
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@600;800&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;background:url('{b64("fundos/"+fundo+".png")}') center/cover;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;font-family:Poppins}}
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
    os.makedirs("artes",exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1080,"height":1080})
        for a in M:
            await pg.set_content(html_m(*a[1:])); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"artes/{a[0]}.jpg",type="jpeg",quality=88)
        for a in G:
            await pg.set_content(html_g(*a[1:])); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"artes/{a[0]}.jpg",type="jpeg",quality=88)
        await b.close()
asyncio.run(main())
from PIL import Image
ids=[a[0] for a in M]+[a[0] for a in G]; W=360
im=Image.new("RGB",(W*6,W*3),"white")
for i,f in enumerate(ids): im.paste(Image.open(f"artes/{f}.jpg").resize((W,W)),((i%6)*W,(i//6)*W))
im.save("folha_artes.jpg",quality=82)
print("ok",len(ids))
