#!/bin/bash
# Сборка 3D-карты: src/map3d.js (+ three.js) -> frontend/v2/map/map3d.min.js
cd /root/mapbuild/js && ./node_modules/.bin/esbuild src/map3d.js --bundle --format=esm --minify --target=es2020 --legal-comments=eof --outfile=/var/www/voblakah-kryma/frontend/v2/map/map3d.min.js
