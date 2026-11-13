"""Прозрачный фон у сканов боевых жетонов: заливка белого фона от краёв → альфа, обрезка по жетону.

Сканы обрезаны по-разному (у рубашек другие поля), поэтому клиент больше не растягивает их в общую рамку,
а рисует в собственных пропорциях. python tools/clean_tokens.py
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

TOKENS = Path(__file__).resolve().parents[1] / 'packages' / 'client' / 'public' / 'art' / 'tokens'
for path in sorted(TOKENS.glob('*.webp')):
    im = np.array(Image.open(path).convert('RGBA'))
    if im[..., 3].min() < 255:
        print(path.name, 'уже прозрачный')
        continue
    rgb = np.ascontiguousarray(im[..., :3])
    h, w = rgb.shape[:2]
    # Фон — почти чистый белый, связанный с краем скана. Порог фиксированный: светло-серые рубашки
    # (≈215) так не «съедаются», как при плавной заливке по соседним пикселям.
    white = (rgb.min(axis=2) > 240).astype(np.uint8)
    n, lab = cv2.connectedComponents(white, connectivity=4)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    alpha = cv2.erode(alpha, np.ones((2, 2), np.uint8))  # без белой каймы
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    im[..., 3] = alpha
    ys, xs = np.nonzero(alpha > 20)
    im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(im).save(path, lossless=True)
    print(path.name, im.shape[1], 'x', im.shape[0])
