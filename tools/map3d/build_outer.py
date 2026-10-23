# Широкая подложка вокруг основной карты: юго-запад Крыма + море (низкое разрешение — видна только издалека).
# Та же цветокоррекция, что у основной карты (перцентили считаются по основной области), чтобы не было шва.
import json, os, requests, numpy as np, rasterio
from rasterio.warp import transform_bounds, reproject, Resampling
from rasterio.transform import from_bounds
from PIL import Image

INNER = [33.57, 44.37, 34.27, 44.56]
OUTER = [32.90, 44.15, 35.30, 45.25]
CRS = "EPSG:32636"
OUT = "/var/www/voblakah-kryma/frontend/v2/map/data"
iL, iB, iR, iT = transform_bounds("EPSG:4326", CRS, *INNER)
L, B, R, T = transform_bounds("EPSG:4326", CRS, *OUTER)
DATES = {"summer": ["2026-08-23", "2026-08-30", "2026-09-02", "2026-08-13"],
         "winter": ["2026-03-01", "2026-03-13", "2026-03-11", "2025-01-20"]}


def stac(date, bbox):
    body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "limit": 30,
            "datetime": f"{date}T00:00:00Z/{date}T23:59:59Z", "query": {"eo:cloud_cover": {"lt": 40}}}
    return requests.post("https://earth-search.aws.element84.com/v1/search", json=body, timeout=60).json()["features"]


def mosaic(dates, bounds, W, H, bbox):
    l, b, r, t = bounds
    tr = from_bounds(l, b, r, t, W, H)
    dst = np.zeros((3, H, W), np.uint8)
    filled = np.zeros((H, W), bool)
    for date in dates:                       # первая дата — основная, следующие только заполняют пробелы
        for it in stac(date, bbox):
            with rasterio.open(it["assets"]["visual"]["href"]) as src:
                tmp = np.zeros((3, H, W), np.uint8)
                reproject(rasterio.band(src, [1, 2, 3]), tmp, dst_transform=tr, dst_crs=CRS, resampling=Resampling.average)
                m = (tmp.sum(0) > 0) & ~filled
                dst[:, m] = tmp[:, m]
                filled |= m
        print(date, "заполнено", round(filled.mean() * 100, 1), "%", flush=True)
        if filled.mean() > 0.995:
            break
    return dst.transpose(1, 2, 0).astype(np.float32), filled


def grade_with(img, lo, hi, gamma, sat):
    x = np.clip((img - lo) / (hi - lo + 1e-6), 0, 1) ** gamma
    g = x.mean(2, keepdims=True)
    x = np.clip(g + (x - g) * sat, 0, 1)
    return (x * 255 + 0.5).astype(np.uint8)


meta = json.load(open(f"{OUT}/meta.json"))
params = {"summer": (0.80, 1.20), "winter": (0.92, 1.05)}
OW = 2048
OH = int(OW * (T - B) / (R - L))
sea_colors = {}
for season, dates in DATES.items():
    # перцентили — по основной области (как в build.py), чтобы цвета совпали
    inner_img, _ = mosaic(dates[:1], (iL, iB, iR, iT), 1024, int(1024 * (iT - iB) / (iR - iL)), INNER)
    lo = np.percentile(inner_img, 1, axis=(0, 1))
    hi = np.percentile(inner_img, 99.6, axis=(0, 1))
    img, filled = mosaic(dates, (L, B, R, T), OW, OH, OUTER)
    out = grade_with(img, lo, hi, *params[season])
    # пустоты (нет снимка) — цветом моря
    sea = np.median(out[(out.sum(2) > 0) & (out.mean(2) < 60) & (out[:, :, 2] > out[:, :, 0])], axis=0) if filled.any() else np.array([14, 30, 60])
    out[~filled] = sea.astype(np.uint8)
    sea_colors[season] = [int(c) for c in sea]
    Image.fromarray(out).save(f"{OUT}/outer_{season}_2048.webp", quality=78, method=6)
    Image.fromarray(out).resize((1024, OH // 2), Image.LANCZOS).save(f"{OUT}/outer_{season}_1024.webp", quality=76, method=6)
    print(season, "готово, цвет моря", sea_colors[season], flush=True)

# Рельеф подложки: Copernicus DEM, листы N44/N45 × E032..E035
HW = 512
HH = int(HW * (T - B) / (R - L))
htr = from_bounds(L, B, R, T, HW, HH)
hm = np.zeros((HH, HW), np.float32)
for lat in (44, 45):
    for lon in (32, 33, 34, 35):
        url = (f"https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N{lat}_00_E0{lon}_00_DEM/"
               f"Copernicus_DSM_COG_10_N{lat}_00_E0{lon}_00_DEM.tif")
        try:
            with rasterio.open(url) as src:
                tmp = np.full((HH, HW), -9999, np.float32)
                reproject(rasterio.band(src, 1), tmp, dst_transform=htr, dst_crs=CRS, dst_nodata=-9999, resampling=Resampling.average)
                m = tmp > -9000
                hm[m] = tmp[m]
        except Exception as e:
            print("нет листа (море)", lat, lon, flush=True)
hm = np.clip(hm, 0, None)
hfile = f"outer_height_{HW}x{HH}.bin"
hm.round().astype("<i2").tofile(f"{OUT}/{hfile}")

meta["outer"] = {
    "bounds_utm36n": [L, B, R, T],
    "offset_m": [L - meta["bounds_utm36n"][0], meta["bounds_utm36n"][3] - T],   # сдвиг левого-верхнего угла относительно основной карты
    "width_m": R - L, "height_m": T - B,
    "height": {"file": hfile, "w": HW, "h": HH},
    "sea_rgb": sea_colors,
}
json.dump(meta, open(f"{OUT}/meta.json", "w"), ensure_ascii=False, indent=1)
print("DONE outer", json.dumps(meta["outer"], ensure_ascii=False), flush=True)
