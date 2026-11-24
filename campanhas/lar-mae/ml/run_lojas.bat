@echo off
cd /d D:\CLAUDE\ofertas-beta\campanhas\lar-mae\ml
echo ==== %DATE% %TIME% ==== >> lojas.log
"C:\Program Files\nodejs\node.exe" coletor_lojas.mjs >> lojas.log 2>&1
