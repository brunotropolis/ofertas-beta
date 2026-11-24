# 24/11: artes de convite dos grupos novos, mesmo molde das de Fraldas/Cupons (campanhas/grupos/artes.py).
# Lar = verde, Mãe = rosa. lb*/mb* = até a Black (25 a 27/11); l*/m* = depois (a partir de 30/11). Saída: artes/ (rascunho pra aprovação).
import os, base64, asyncio
from playwright.async_api import async_playwright
def b64(p): return "data:image/%s;base64,"%("png" if p.endswith("png") else "jpeg")+base64.b64encode(open(p,"rb").read()).decode()
PAL = {
 "l": dict(fundo="#13987E", fundo2="#1DB394", pill="#FFFFFF", pilltx="#0F7F69", big="#FFFFFF", sub="#DDF7EF", btn="#FFD84D", btntx="#0B4A3D", selo="GRUPO DO LAR", ic="🏠", logo="logos/lar_b2.png"),
 "m": dict(fundo="#D2448F", fundo2="#E461A6", pill="#FFFFFF", pilltx="#C2367F", big="#FFFFFF", sub="#FFE4F1", btn="#FFE14D", btntx="#6B1240", selo="GRUPO DA MÃE", ic="💄", logo="logos/mae_b1.png"),
}
A = [  # id, pill, big, sub
 ("lb1","ATÉ A BLACK","Casa em oferta","Limpeza e lavanderia com preço de Black"),
 ("lb2","BLACK FRIDAY","Sabão e amaciante baratinhos","O que você compra todo mês, com desconto"),
 ("lb3","É HOJE","Black da casa","As melhores ofertas pro lar, no grupo novo"),
 ("l1","GRUPO DO LAR","Casa limpa, bolso cheio","Limpeza e lavanderia com preço bom"),
 ("l2","RECOMPRA DO MÊS","Sabão em pó mais barato","A gente avisa quando o preço cai"),
 ("l3","COZINHA E CASA","Cozinha em oferta","Panela, potes e utilidades pagando menos"),
 ("l4","TODO DIA","Casa em dia","Ofertas de casa selecionadas pra mãe"),
 ("l5","MÃE AJUDA MÃE","Chama as amigas","Quem cuida da casa vai amar o grupo"),
 ("mb1","ATÉ A BLACK","Um mimo pra você","Beleza, cabelo e unhas com preço de Black"),
 ("mb2","BLACK FRIDAY","Skincare em oferta","Protetor, hidratante e óleo em oferta"),
 ("mb3","É HOJE","Black da mãe","Ofertas de beleza no grupo novo"),
 ("m1","AUTOCUIDADO","Você também merece","Beleza e autocuidado com preço bom"),
 ("m2","CABELO","Cabelo em dia","Kits de cabelo e cachos em oferta"),
 ("m3","BELEZA","Unhas lindas gastando pouco","Esmalte e maquiagem em oferta"),
 ("m4","PÓS-PARTO","Cuidar de você também","Hidratante e óleo pra essa fase"),
 ("m5","MÃE AJUDA MÃE","Chama as amigas","Mãe que se cuida vai amar o grupo"),
]
POS = {'l2':'78%','m2':'15%'}
def html(id,pill,big,sub):
    p = PAL[id[0]]; foto = b64(f"fotos/{id}.png"); logo = b64(p["logo"])
    bs = 118 if len(big) <= 14 else 100 if len(big) <= 20 else 86
    return f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet"><style>
*{{margin:0;box-sizing:border-box}} body{{width:1080px;height:1080px;font-family:Fredoka,sans-serif;position:relative;overflow:hidden;background:{p['fundo']}}}
.foto{{position:absolute;top:0;left:0;width:1080px;height:600px;background:url('{foto}') center {POS.get(id,'40%')}/cover}}
.onda{{position:absolute;top:540px;left:-40px;width:1160px;height:140px;background:linear-gradient(180deg,{p['fundo2']},{p['fundo']});border-radius:50% 50% 0 0/100% 100% 0 0}}
.painel{{position:absolute;top:590px;left:0;width:1080px;height:490px;display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:6px}}
.selo{{position:absolute;top:36px;left:36px;background:{p['fundo']};color:#fff;font-weight:700;font-size:38px;letter-spacing:1px;padding:14px 30px;border-radius:60px;box-shadow:0 8px 24px rgba(0,0,0,.25)}}
.pill{{background:{p['pill']};color:{p['pilltx']};font-weight:700;font-size:32px;letter-spacing:1.5px;padding:10px 30px;border-radius:50px}}
.big{{font-weight:700;font-size:{bs}px;line-height:1;color:{p['big']};margin:22px 0 14px;text-shadow:0 6px 0 rgba(0,0,0,.15);letter-spacing:-1px;max-width:1000px}}
.sub{{font-weight:500;font-size:46px;line-height:1.15;color:{p['sub']};max-width:900px}}
.btn{{margin-top:26px;background:{p['btn']};color:{p['btntx']};font-weight:700;font-size:44px;padding:16px 46px;border-radius:60px;box-shadow:0 6px 0 rgba(0,0,0,.18)}}
.logo{{position:absolute;top:24px;right:24px;width:180px;height:180px;border-radius:50%;box-shadow:0 6px 16px rgba(0,0,0,.25);background:url('{logo}') center/118%;border:4px solid #fff}}
</style></head><body><div class=foto></div><div class=onda></div><div class=selo>{p['ic']} {p['selo']}</div><div class=logo></div>
<div class=painel><div class=pill>{pill}</div><div class=big>{big}</div><div class=sub>{sub}</div><div class=btn>É de graça, entra pelo link</div></div></body></html>"""
async def main():
    os.makedirs("artes",exist_ok=True)
    async with async_playwright() as pw:
        b=await pw.chromium.launch(); pg=await b.new_page(viewport={"width":1080,"height":1080})
        for a in A:
            await pg.set_content(html(*a)); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"artes/{a[0]}.jpg",type="jpeg",quality=88)
        await b.close()
asyncio.run(main())
from PIL import Image
W=360
for nome, ids in [("folha_artes_lar.jpg",[a[0] for a in A if a[0][0]=="l"]),("folha_artes_mae.jpg",[a[0] for a in A if a[0][0]=="m"])]:
    im=Image.new("RGB",(W*4,W*2),"white")
    for i,x in enumerate(ids): im.paste(Image.open(f"artes/{x}.jpg").resize((W,W)),((i%4)*W,(i//4)*W))
    im.save(nome,quality=85)
print("ok")
