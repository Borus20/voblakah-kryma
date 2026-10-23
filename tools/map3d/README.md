# 3D-карта побережья (v2)

Данные и код 3D-карты для `/v2/` (страница-тест: `/v2/map/`).

- `build.py` — собирает данные в `frontend/v2/map/data/`: спутниковые текстуры лето/зима
  (Copernicus Sentinel-2 L2A, 23.08.2026 и 01.03.2026, AWS Earth Search), рельеф (Copernicus DEM GLO-30),
  координаты мест (`places.json`: дом — с Яндекс.Карты сайта, остальные — OpenStreetMap).
  Запуск на сервере: `cd /root/mapbuild && ./venv/bin/python build.py` (venv с rasterio, numpy, pillow, requests).
- `build_outer.py` — широкая подложка вокруг (юго-запад Крыма, низкое разрешение) + цвет воды на снимках; запускать после build.py.
- `map3d.src.js` — исходник карты (three.js 0.186.1). Сборка: `/root/mapbuild/js/build.sh`
  (esbuild → `frontend/v2/map/map3d.min.js`). После сборки поднять `?v=` у импорта в HTML.
