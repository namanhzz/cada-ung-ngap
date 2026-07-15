# Bản đồ nguy cơ ngập sơ bộ — Miền Bắc Việt Nam 🌊

Demo web app hiển thị **nguy cơ ngập sơ bộ** theo thời gian cho miền Bắc Việt Nam,
tái hiện sự kiện **bão Yagi (5–15/9/2024)** với thanh trượt thời gian.

> ⚠️ Chỉ số heuristic minh hoạ — **không dùng cho cảnh báo thực tế**.

## Dữ liệu

| Nguồn | Nội dung |
|---|---|
| [PDIR-Now](https://chrsdata.eng.uci.edu/) (CHRS, UC Irvine) | Mưa vệ tinh hourly, 0.04° (~4km) |
| DEM SRTM 30m v3 (NASA/USGS, qua [gis.vn](https://gis.vn/dem-viet-nam-srtm-30m-v3-nasa-usgs) hoặc AWS terrarium) | Địa hình 30m |
| Ranh giới 34 tỉnh/thành **sau sáp nhập 2025** ([gis.vn](https://gis.vn/kinh-tuyen-truc-ban-do-hanh-chinh-cap-tinh-thanh-viet-nam) / GitHub mirror) | Hành chính |

## Mô hình (sơ bộ)

- **Độ nhạy cảm địa hình** `S = 0.25·E + 0.30·Sl + 0.45·D` với:
  - `E` — cao độ thấp (`1 − elev/300m`)
  - `Sl` — độ dốc thoải (`1 − slope/15°`, Horn 3×3)
  - `D` — đáy thung lũng/vùng trũng (proxy HAND: chênh cao so với min cục bộ bán kính 2km, chuẩn hoá 15m)
- **Hệ số mưa** `F = 0.6·R24/200mm + 0.4·R72/400mm` (tổng mưa trượt 24h/72h)
- **Nguy cơ** `Risk = S × F` → 4 lớp: Thấp / Trung bình / Cao / Rất cao

Tham số chỉnh trong `config/pipeline.config.json`.

## Chạy

```bash
npm install
npm run build:all   # tải + xử lý toàn bộ dữ liệu (lần đầu ~15-30 phút, ~1.5GB)
npm run dev         # mở http://localhost:5173
```

Các bước lẻ: `fetch:rain` → `build:rain` → `fetch:boundaries` → `build:boundaries`
→ `fetch:dem` → `build:terrain` → `build:tiles` → `build:riskgrid`.

**DEM gis.vn (tuỳ chọn):** tải GeoTIFF quốc gia từ gis.vn, đặt vào
`data/raw/dem/vn_dem30m.tif` rồi xoá `data/derived/dem/` và chạy lại `fetch:dem`.
Nếu không có, pipeline tự dùng AWS terrarium tiles (cùng gốc NASA SRTMGL1).

## Kiến trúc

- **Pipeline Node thuần** (không Python): xử lý DEM theo strip trên lưới Web Mercator z12
  (~35m), min-filter O(n) van Herk/Gil-Werman, xuất slippy tiles PNG (sharp).
- **Frontend Vite + MapLibre**: tiles tĩnh 30m (độ nhạy cảm + bóng đổ) + 2 canvas động
  (mưa 4km, nguy cơ ~355m) phân loại **trong browser mỗi frame** → animate mượt,
  không cần asset per-timestep.
