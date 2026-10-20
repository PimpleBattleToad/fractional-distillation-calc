"""Рисует иконки приложения (PWA) без внешних ассетов.

Запуск:  python tools/make-icons.py
Результат: icons/icon-180.png, icon-192.png, icon-512.png, maskable-512.png

Силуэт капли задаётся шириной по высоте: снизу — круг, выше центра ширина
плавно сходится к острию. Такой профиль даёт гладкую каплю без «узла» на
стыке круга и конуса.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SS = 4  # суперсэмплинг: считаем крупно, уменьшаем с LANCZOS — края гладкие

BG = (16, 14, 12)
ACCENT_TOP = (233, 176, 106)
ACCENT_BOTTOM = (198, 130, 62)
GLOW = (215, 154, 91)
HIGHLIGHT = (247, 233, 215)

OUT = Path(__file__).resolve().parent.parent / 'icons'


def smooth(mask: np.ndarray, radius: float) -> np.ndarray:
    """Лёгкое размытие маски: убирает ступеньки у острия капли."""
    img = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), 'L')
    img = img.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(img, dtype=np.float32) / 255.0


def rounded_mask(size: int, radius_ratio: float) -> np.ndarray:
    """Прямоугольник со скруглёнными углами как маска 0..1."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    r = size * radius_ratio
    dx = np.clip(np.abs(x - size / 2) - (size / 2 - r), 0, None)
    dy = np.clip(np.abs(y - size / 2) - (size / 2 - r), 0, None)
    return np.clip(r + 0.5 - np.sqrt(dx * dx + dy * dy), 0, 1)


def droplet_mask(size: int, scale: float) -> np.ndarray:
    """Капля: круглое дно + конус, касательный к кругу.

    Стороны конуса — касательные к кругу, поэтому в месте стыка силуэт
    остаётся гладким (без изломов и «узла»), а кверху капля сходится в острие.
    """
    cx, cy = size / 2.0, size * 0.585
    r = size * 0.195 * scale
    apex_y = cy - size * 0.375 * scale

    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    px, py = x - cx, y - cy

    # расстояние до круга
    d_circle = np.sqrt(px * px + py * py) - r

    # точки касания конуса с кругом
    h = cy - apex_y
    tx = r * np.sqrt(max(h * h - r * r, 1e-6)) / h
    ty = -r * r / h
    verts = [(0.0, -h), (tx, ty), (-tx, ty)]

    # выпуклый треугольник: знаковое расстояние = максимум по сторонам
    d_tri = np.full((size, size), -np.inf, dtype=np.float32)
    ccx = sum(v[0] for v in verts) / 3.0
    ccy = sum(v[1] for v in verts) / 3.0
    for i in range(3):
        ax, ay = verts[i]
        bx, by = verts[(i + 1) % 3]
        ex, ey = bx - ax, by - ay
        nx, ny = ey, -ex
        n = np.hypot(nx, ny)
        nx, ny = nx / n, ny / n
        if (ccx - ax) * nx + (ccy - ay) * ny > 0:
            nx, ny = -nx, -ny
        d_tri = np.maximum(d_tri, (px - ax) * nx + (py - ay) * ny)

    d = np.minimum(d_circle, d_tri)
    mask = np.clip(0.5 - d, 0, 1)
    return smooth(mask, 1.5)


def draw(size: int, maskable: bool) -> Image.Image:
    big = size * SS
    canvas = np.zeros((big, big, 3), dtype=np.float32)
    canvas[:] = np.array(BG, dtype=np.float32)

    # тёплое свечение за каплей
    y, x = np.mgrid[0:big, 0:big].astype(np.float32)
    cx, cy = big / 2.0, big * 0.55
    glow_r = big * 0.55
    glow = np.clip(1 - np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / glow_r, 0, 1) ** 2
    glow = (glow * 0.22)[..., None] * np.array(GLOW, dtype=np.float32)
    canvas = canvas * (1 - glow / 255.0) + glow

    # капля с вертикальным градиентом
    scale = 0.80 if maskable else 1.0
    drop = droplet_mask(big, scale)
    top = np.array(ACCENT_TOP, dtype=np.float32)
    bottom = np.array(ACCENT_BOTTOM, dtype=np.float32)
    grad = np.linspace(0, 1, big, dtype=np.float32)[:, None, None]
    drop_color = top * (1 - grad) + bottom * grad
    canvas = canvas * (1 - drop[..., None]) + drop_color * drop[..., None]

    # блик внутри капли
    hl_dist = np.sqrt((x - (cx - big * 0.05)) ** 2 + (y - (cy - big * 0.055)) ** 2)
    hl = np.clip(1 - hl_dist / (big * 0.085), 0, 1) ** 2
    hl = (hl * 0.55 * drop)[..., None]
    canvas = canvas * (1 - hl) + np.array(HIGHLIGHT, dtype=np.float32) * hl

    # у обычной иконки — скруглённый квадрат, у maskable — всё поле
    alpha = np.ones((big, big), dtype=np.float32) if maskable else rounded_mask(big, 0.22)

    rgba = np.dstack([np.clip(canvas, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA').resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        img = draw(size, maskable=False)
        path = OUT / f'icon-{size}.png'
        img.save(path)
        print(f'{path.name}: {size}x{size}, {path.stat().st_size} bytes')

    img = draw(512, maskable=True)
    path = OUT / 'maskable-512.png'
    img.save(path)
    print(f'{path.name}: 512x512, {path.stat().st_size} bytes')


if __name__ == '__main__':
    main()
