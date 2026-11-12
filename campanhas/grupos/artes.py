# 12/Nov v2 (Bruno: "uma paleta pra cupons e outra pra fraldas... imagens de verdade"): foto realista em cima
# (fotos/*.png, Seedream via gerar_fotos.py) + faixa de cor embaixo. Fraldas = azul, Cupons = laranja.
import os, base64, asyncio
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
PAL = {
 "f": dict(fundo="#1F6FC2", fundo2="#2F86DD", claro="#E6F2FD", pill="#FFFFFF", pilltx="#1F6FC2", big="#FFFFFF", sub="#DCEEFF", btn="#FFD84D", btntx="#123E6B", selo="GRUPO DE FRALDAS", ic="👶"),
 "k": dict(fundo="#F2620F", fundo2="#FF7A2A", claro="#FFF1E3", pill="#FFFFFF", pilltx="#E0560A", big="#FFFFFF", sub="#FFE8D6", btn="#FFE14D", btntx="#5A2400", selo="GRUPO DE CUPONS", ic="🎟️"),
}
A = [  # id, pill, big, sub
 ("f1","SÓ OFERTA DE FRALDA","Fralda barata","Fralda e lenço das melhores marcas, todo dia"),
 ("f2","PRA QUEM COMPRA TODO MÊS","Huggies e Pampers","Os melhores preços chegam primeiro no grupo"),
 ("f3","ACABOU A FRALDA?","Não pague caro","A gente avisa quando o preço cai"),
 ("f4","MÃE AJUDA MÃE","Chama as amigas","Quem vive comprando fralda vai amar o grupo"),
 ("f5","ECONOMIA DE VERDADE","Pacotão em oferta","Do RN ao XXG, das melhores marcas"),
 ("k1","SHOPEE, MERCADO LIVRE E AMAZON","Só cupons","O código chega assim que sai"),
 ("k2","CUPOM ACABA RÁPIDO","Chega primeiro","Receba o código na hora, direto no celular"),
 ("k3","ANTES DE COMPRAR","Tem cupom?","Confere no grupo e paga menos"),
 ("k4","MÃE ESPERTA","Desconto extra","Nas compras do bebê e da casa"),
 ("k5","ECONOMIZA MAIS","Cupom + oferta","Junta o cupom com as ofertas e paga bem menos"),
]
LOGO = b64("../1111/logo_m.jpg")
def html(id,pill,big,sub):
    p = PAL[id[0]]; foto = b64(f"fotos/{id}.png")
    bs = 118 if len(big) <= 14 else 100
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;font-family:Fredoka,sans-serif;position:relative;overflow:hidden;background:{p['fundo']}}}
.foto{{position:absolute;top:0;left:0;width:1080px;height:600px;background:url('{foto}') center 40%/cover}}
.onda{{position:absolute;top:540px;left:-40px;width:1160px;height:140px;background:linear-gradient(180deg,{p['fundo2']},{p['fundo']});border-radius:50% 50% 0 0/100% 100% 0 0}}
.painel{{position:absolute;top:590px;left:0;width:1080px;height:490px;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:6px}}
.selo{{position:absolute;top:36px;left:36px;background:{p['fundo']};color:#fff;font-weight:700;font-size:38px;letter-spacing:1px;padding:14px 30px;border-radius:60px;box-shadow:0 8px 24px rgba(0,0,0,.25)}}
.pill{{background:{p['pill']};color:{p['pilltx']};font-weight:700;font-size:32px;letter-spacing:1.5px;padding:10px 30px;border-radius:50px}}
.big{{font-weight:700;font-size:{bs}px;line-height:1;color:{p['big']};margin:22px 0 14px;text-shadow:0 6px 0 rgba(0,0,0,.15);letter-spacing:-1px}}
.sub{{font-weight:500;font-size:42px;line-height:1.15;color:{p['sub']};max-width:900px}}
.btn{{margin-top:26px;background:{p['btn']};color:{p['btntx']};font-weight:700;font-size:38px;padding:14px 40px;border-radius:60px;box-shadow:0 6px 0 rgba(0,0,0,.18)}}
.logo{{position:absolute;top:30px;right:30px;width:112px;height:112px;border-radius:24px;box-shadow:0 6px 16px rgba(0,0,0,.2);background:url('{LOGO}') center/cover}}
</style></head><body><div class=foto></div><div class=onda></div><div class=selo>{p['ic']} {p['selo']}</div><div class=logo></div>
<div class=painel><div class=pill>{pill}</div><div class=big>{big}</div><div class=sub>{sub}</div><div class=btn>É de graça, entra pelo link</div></div></body></html>"""
async def main():
    out="../../public/avisos/grupos"; os.makedirs(out,exist_ok=True)
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); pg=await b.new_page(viewport={"width":1080,"height":1080})
        for a in A:
            await pg.set_content(html(*a)); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"{out}/{a[0]}.jpg",type="jpeg",quality=88)
        await b.close()
asyncio.run(main())
from PIL import Image
W=360; im=Image.new("RGB",(W*5,W*2),"white")
for i,a in enumerate(A): im.paste(Image.open(f"../../public/avisos/grupos/{a[0]}.jpg").resize((W,W)),((i%5)*W,(i//5)*W))
im.save("folha_artes.jpg",quality=82); print("ok")
