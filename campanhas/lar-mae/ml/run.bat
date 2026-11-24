@echo off
cd /d D:\CLAUDE\ofertas-beta\campanhas\lar-mae\ml
echo ==== %DATE% %TIME% ==== >> coletor.log
"C:\Program Files\nodejs\node.exe" coletor_ml.cjs >> coletor.log 2>&1
