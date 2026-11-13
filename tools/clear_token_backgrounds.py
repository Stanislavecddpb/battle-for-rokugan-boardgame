"""Убирает белый фон со сканов особых жетонов (мир, выжженная земля, честь…): заливка от углов → прозрачность.

python tools/clear_token_backgrounds.py
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

SPECIALS = Path(__file__).resolve().parents[1] / 'packages' / 'client' / 'public' / 'art' / 'specials'
for path in sorted(SPECIALS.glob('*.webp')):
    im = np.array(Image.open(path).convert('RGBA'))
    rgb = np.ascontiguousarray(im[..., :3])
    h, w = rgb.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        if rgb[y, x].min() > 225:  # угол белый — это фон
            cv2.floodFill(rgb.copy(), mask, (x, y), 0, (18, 18, 18), (18, 18, 18), cv2.FLOODFILL_MASK_ONLY | 8)
    bg = mask[1:-1, 1:-1] > 0
    if not bg.any():
        print(path.name, 'без изменений')
        continue
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)  # мягкий край
    im[..., 3] = np.minimum(im[..., 3], alpha)
    Image.fromarray(im).save(path, lossless=True)
    print(path.name, 'фон убран')
