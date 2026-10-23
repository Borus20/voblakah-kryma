# Сборка данных 3D-карты побережья: спутниковые текстуры (лето/зима), рельеф, метки.
# Источники: Copernicus Sentinel-2 L2A (AWS Earth Search), Copernicus DEM GLO-30 (AWS Open Data).
import json, os, requests, numpy as np, rasterio
from rasterio.warp import transform_bounds, reproject, Resampling, transform as warp_xy
from rasterio.transform import from_bounds
from PIL import Image

BBOX = [33.57, 44.37, 34.27, 44.56]          # Балаклава — Никитский сад
CRS = "EPSG:32636"                            # UTM 36N, метры
OUT = "/var/www/voblakah-kryma/frontend/v2/map/data"
os.makedirs(OUT, exist_ok=True)
L, B, R, T = transform_bounds("EPSG:4326", CRS, *BBOX)


def stac(date):
    body = {"collections": ["sentinel-2-l2a"], "bbox": BBOX,
            "datetime": f"{date}T00:00:00Z/{date}T23:59:59Z", "limit": 10}
    return requests.post("https://earth-search.aws.element84.com/v1/search", json=body, timeout=60).json()["features"]


def mosaic_rgb(date, W, H):
    tr = from_bounds(L, B, R, T, W, H)
    dst = np.zeros((3, H, W), np.uint8)
    for it in stac(date):
        with rasterio.open(it["assets"]["visual"]["href"]) as src:
            tmp = np.zeros((3, H, W), np.uint8)
            reproject(rasterio.band(src, [1, 2, 3]), tmp, dst_transform=tr, dst_crs=CRS,
                      resampling=Resampling.average)
            m = tmp.sum(0) > 0
            dst[:, m] = tmp[:, m]
    return dst.transpose(1, 2, 0).astype(np.float32)


def grade(img, gamma, sat):
    # мягкая цветокоррекция: растяжка по перцентилям, гамма, насыщенность
    lo = np.percentile(img, 1, axis=(0, 1))
    hi = np.percentile(img, 99.6, axis=(0, 1))
    x = np.clip((img - lo) / (hi - lo + 1e-6), 0, 1) ** gamma
    g = x.mean(2, keepdims=True)
    x = np.clip(g + (x - g) * sat, 0, 1)
    return (x * 255 + 0.5).astype(np.uint8)


def save_tex(name, date, gamma, sat):
    W = 4096
    H = int(W * (T - B) / (R - L))
    big = grade(mosaic_rgb(date, W, H), gamma, sat)
    Image.fromarray(big).save(f"{OUT}/{name}_4096.webp", quality=82, method=6)
    Image.fromarray(big).resize((2048, H // 2), Image.LANCZOS).save(f"{OUT}/{name}_2048.webp", quality=80, method=6)
    print("texture", name, date, big.shape, flush=True)
    return big.shape


shape = save_tex("summer", "2026-08-23", 0.80, 1.20)
save_tex("winter", "2026-03-01", 0.92, 1.05)

# Рельеф: Copernicus DEM GLO-30 (два листа: E033 и E034)
HW = 768
HH = int(HW * (T - B) / (R - L))
htr = from_bounds(L, B, R, T, HW, HH)
hm = np.full((HH, HW), -9999, np.float32)
for lon in (33, 34):
    url = (f"https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N44_00_E0{lon}_00_DEM/"
           f"Copernicus_DSM_COG_10_N44_00_E0{lon}_00_DEM.tif")
    with rasterio.open(url) as src:
        tmp = np.full((HH, HW), -9999, np.float32)
        reproject(rasterio.band(src, 1), tmp, dst_transform=htr, dst_crs=CRS,
                  dst_nodata=-9999, resampling=Resampling.average)
        m = tmp > -9000
        hm[m] = tmp[m]
hm[hm < -9000] = 0
hm = np.clip(hm, 0, None)
hfile = f"height_{HW}x{HH}.bin"
hm.round().astype("<i2").tofile(f"{OUT}/{hfile}")
print("height", HW, HH, "max", hm.max(), flush=True)

places = json.load(open("/root/mapbuild/places.json"))
xs, ys = warp_xy("EPSG:4326", CRS, [p["lon"] for p in places.values()], [p["lat"] for p in places.values()])
pl = {}
for (k, p), x, y in zip(places.items(), xs, ys):
    u, v = (x - L) / (R - L), (T - y) / (T - B)
    col = min(HW - 1, max(0, int(u * HW)))
    row = min(HH - 1, max(0, int(v * HH)))
    pl[k] = {"u": round(u, 5), "v": round(v, 5), "h": int(hm[row, col])}

meta = {
    "bounds_utm36n": [L, B, R, T], "width_m": R - L, "height_m": T - B,
    "height": {"file": hfile, "w": HW, "h": HH, "max": int(hm.max())},
    "textures": {"summer": "2026-08-23", "winter": "2026-03-01", "w": shape[1], "h": shape[0]},
    "places": pl,
    "attribution": ("Снимки: Copernicus Sentinel-2 (ЕКА), 2026. Рельеф: Copernicus DEM GLO-30 "
                    "© DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018, "
                    "предоставлено ЕС и ЕКА в рамках программы Copernicus."),
}
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False, indent=1)
print("DONE", json.dumps(pl, ensure_ascii=False), flush=True)
