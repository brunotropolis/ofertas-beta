# 25/11: arte do cupom Magalu no mesmo molde das de ML/Shopee/Amazon (public/cupons/*.png, 640x640).
# Saída: public/cupons/magalu.png (só vai pro ar depois do Bruno ver).
import asyncio, os
from playwright.async_api import async_playwright
HTML = """<html><head><link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@700;800&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box} body{width:640px;height:640px;font-family:'Open Sans',sans-serif;background:linear-gradient(180deg,#fdeef5,#f6cfe3);position:relative;overflow:hidden}
.top{position:absolute;top:76px;width:100%;text-align:center;color:#d6559d;font-weight:800;font-size:31px;letter-spacing:.5px}
.t{position:absolute;top:150px;left:70px;width:500px;height:300px;background:#0086ff;border-radius:34px;box-shadow:0 18px 40px rgba(120,60,110,.25)}
.n{position:absolute;top:276px;width:48px;height:48px;border-radius:50%;background:#f9dcea}
.l{left:46px}.r{right:46px}
.d{position:absolute;left:140px;top:22px;bottom:22px;border-left:4px dashed #fff}
.p{position:absolute;left:52px;top:112px;color:#fff;font-weight:800;font-size:64px}
.c{position:absolute;left:150px;right:0;top:92px;text-align:center;color:#fff}
.c b{display:block;font-size:66px;font-weight:800;line-height:1}
.c span{display:block;font-size:30px;font-weight:800;color:#ffe100;margin-top:10px}
.f{position:absolute;bottom:76px;width:100%;text-align:center;font-weight:800;font-size:33px}
</style></head><body><div class=top>CUPOM DE DESCONTO</div>
<div class=t><div class=d></div><div class=p>%</div><div class=c><b>CUPOM</b><span>MAGALU</span></div></div>
<div class="n l"></div><div class="n r"></div>
<div class=f><span style="color:#1fae8a">as ofertas</span> <span style="color:#d6559d">maternas</span></div></body></html>"""
async def main():
    out = os.path.join(os.path.dirname(__file__), "..", "..", "public", "cupons", "magalu.png")
    async with async_playwright() as pw:
        b = await pw.chromium.launch(); pg = await b.new_page(viewport={"width": 640, "height": 640})
        await pg.set_content(HTML); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=out); await b.close()
    print("ok", os.path.abspath(out))
asyncio.run(main())
