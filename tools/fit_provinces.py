"""Находит границы провинций на скане поля (компьютерное зрение) и пишет полигоны в board-points.json.

1. Маска линий границ: светлые кремовые линии и береговая кромка (яркие пиксели с низкой насыщенностью).
2. Маркеры: по точке на каждую провинцию (из board-points.json) + «море/рамка» по краям и в воде.
3. Водораздел (cv2.watershed) по изображению «расстояния до линии границы» разливает каждую провинцию
   от её точки до ближайших линий.
4. Контур каждой области упрощается и сохраняется в координатах поля 600×900.

python tools/fit_provinces.py [--preview]
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import heapq
import re

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'packages' / 'client' / 'public' / 'art'
POINTS = ART / 'board-points.json'
BOARD = ART / 'board.webp'
S = 2  # работаем в половинном масштабе скана 1800×2700 → 900×1350
K = 3 / S  # координаты поля (600×900) → пиксели рабочего изображения

# Точки воды и рамки (в координатах поля 600×900): всё, что не провинция.
SEA = [(480, 330), (520, 450), (470, 560), (300, 700), (250, 800), (380, 800), (540, 800),
       (560, 120), (500, 260), (330, 870), (150, 880), (40, 860), (590, 600),
       (560, 360), (520, 520), (465, 860), (220, 845), (100, 820), (585, 700), (500, 850), (300, 620)]

# Точки, где фишка провинции стоит на значке посреди рек: заливку начинаем с чистого места рядом.
SEED_AT = {'17': (110, 720)}
# Провинции с густой штриховкой (лес, горы), куда заливка от одной точки не доходит: ещё точки.
SEED_EXTRA = {'3': [(420, 40), (430, 160), (440, 75), (417, 50)],
              '5': [(462, 190)],  # южный мыс Феникса 5 отрезан береговой кромкой
              '10': [(175, 425)],  # лес над диагональю 10|19
              '12': [(217, 757)],  # южный полуостров Гор
              '23': [(180, 742),  # суша к югу от залива — часть Краба 23
                     (200, 733), (223, 710), (210, 722),  # сам залив до Гор 12 — тоже Краб 23, не море
                     (118, 560), (130, 600)]}  # полоса гор без звёзд между Землями Тени и Крабом 19  # тёмная полоса суши у залива — часть Краба 23
# Стены: светлые линии границ, которые на скане бледные или прерываются (в координатах поля 600×900).
# Сняты по скану с координатной сеткой (см. tools/grid в README).
# Стены нужны только там, где белая линия лежит прямо на сгибе поля (сгиб стирается вместе с ней).
# Точки сняты по увеличенному скану с сеткой.
WALLS = [
    # 18 | 26 и верх 13 (лес)
    [(0, 287), (10, 292), (25, 292), (30, 290), (50, 290), (60, 287), (64, 285), (70, 282), (76, 281),
     (90, 286), (100, 283), (110, 282), (120, 281), (128, 273), (135, 271), (150, 270), (160, 273),
     (170, 279), (180, 284), (189, 290)],
]


def flood(relief: np.ndarray, markers: np.ndarray) -> np.ndarray:
    """Водораздел с приоритетом по высоте рельефа; на ровных участках — по очереди (как волна от точки).

    cv2.watershed смотрит на разницу цветов соседей, а scipy IFT на плато отдаёт всё последнему маркеру —
    поэтому своя заливка."""
    h, w = relief.shape
    lab = markers.ravel().copy()
    rel = relief.ravel().astype(np.int32)
    heap = [(int(rel[i]), 0, i) for i in np.flatnonzero(lab)]  # все маркеры стартуют одновременно
    heapq.heapify(heap)
    n = len(heap)
    while heap:
        pr, _, i = heapq.heappop(heap)
        y, x = divmod(i, w)
        for j in (i - w if y else -1, i + w if y < h - 1 else -1, i - 1 if x else -1, i + 1 if x < w - 1 else -1):
            if j >= 0 and not lab[j]:
                lab[j] = lab[i]
                n += 1
                heapq.heappush(heap, (max(pr, int(rel[j])), n, j))
    return lab.reshape(h, w)


def border_lines(full: np.ndarray) -> np.ndarray:
    """Маска белых линий границ (в половинном масштабе). На этой карте каждая белая линия — граница;
    дорог нет, реки синие. Линия — кремовая (яркая, малонасыщенная, жёлтый оттенок) и ярче соседей."""
    hsv = cv2.cvtColor(full, cv2.COLOR_BGR2HSV).astype(np.int16)
    gray = cv2.cvtColor(full, cv2.COLOR_BGR2GRAY)
    H, Sat, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # Линия светлее и бледнее своего фона: сравниваем с медианой окрестности (фон — бумага провинции).
    v_bg = cv2.medianBlur(hsv[..., 2].astype(np.uint8), 31).astype(np.int16)
    s_bg = cv2.medianBlur(hsv[..., 1].astype(np.uint8), 31).astype(np.int16)
    cream = (V > 165) & (Sat < 90) & ((H < 45) | (Sat < 30))
    mask = (cream & (V - v_bg > 11) & (Sat <= np.maximum(s_bg + 20, 45))).astype(np.uint8) * 255
    # Сгиб поля — идеально прямая горизонталь через весь скан: это не граница.
    # Находим его по строкам, которые в среднем заметно светлее соседних, и стираем только их.
    rows = V.mean(1)
    bump = rows - cv2.blur(rows.reshape(-1, 1).astype(np.float32), (1, 41)).ravel()
    for r in np.flatnonzero(bump > 15):
        if 20 < r < len(rows) - 20:
            mask[r - 3:r + 4] = 0
    # Линия тонкая (до ~8 px): толстые пятна — облака, блики воды, гербы — вырезаем целиком.
    fat = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    mask = cv2.subtract(mask, cv2.dilate(fat, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))))
    # Линии длинные; звёзды, штриховка и крапинки — короткие.
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros(n, bool)
    for j in range(1, n):
        x, y, bw, bh, area = st[j]
        m = max(bw, bh)
        keep[j] = m > 600 or (m > 45 and area / m < 16)  # большие сети линий — всегда
    mask = keep[lab].astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    half = cv2.resize(mask, (full.shape[1] // S, full.shape[0] // S), interpolation=cv2.INTER_AREA)
    return (half > 60).astype(np.uint8) * 255


def land_edges():
    """Пары соседей из board.ts (LAND_BORDERS): [a, b, x, y]."""
    src = (ROOT / 'packages' / 'engine' / 'src' / 'board.ts').read_text(encoding='utf-8')
    body = src[src.index('LAND_BORDERS'):src.index('];', src.index('LAND_BORDERS'))]
    return [tuple(map(int, m)) for m in re.findall(r'\[(\d+),(\d+),(\d+),(\d+)\]', body)]


def border_points(ws: np.ndarray, ids: list[str]) -> dict:
    """Точка для жетона на сухопутной границе: середина общего участка контуров двух провинций."""
    lab = {pid: i for i, pid in enumerate(ids, start=1)}
    out = {}
    for a, b, *_ in land_edges():
        A = ws == lab[str(a)]
        B = ws == lab[str(b)]
        near = cv2.dilate(B.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        touch = np.argwhere(A & near)
        if len(touch) < 4:
            continue  # соседи через воду/мост: остаётся точка из board.ts
        c = touch.mean(axis=0)
        y, x = touch[np.argmin(((touch - c) ** 2).sum(axis=1))]  # ближайшая к центру точка самой границы
        out[f'{a}-{b}'] = [round(float(x) / K, 1), round(float(y) / K, 1)]
    return out


def main(preview: bool):
    data = json.loads(POINTS.read_text(encoding='utf-8'))
    full = cv2.imdecode(np.fromfile(str(BOARD), np.uint8), cv2.IMREAD_COLOR)
    img = cv2.resize(full, (full.shape[1] // S, full.shape[0] // S), interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    line = border_lines(full)
    for wall in WALLS:
        cv2.polylines(line, [np.array([(int(x * K), int(y * K)) for x, y in wall], np.int32)], False, 255, 3)
    # Рельеф: чем ближе к линии, тем «выше» — водораздел встаёт на середину линии.
    dist = cv2.distanceTransform(255 - line, cv2.DIST_L2, 5)
    relief = (255 - np.sqrt(np.minimum(dist, 22) / 22) * 255).astype(np.uint8)
    relief[:3, :] = 255  # по кромке скана заливка не перетекает между провинциями
    markers = np.zeros((h, w), np.int32)
    ids = sorted(data['points'], key=int)
    for i, pid in enumerate(ids, start=1):
        p = data['points'][pid]
        x, y = SEED_AT.get(pid, (p['x'], p['y']))
        c = (int(x * K), int(y * K))
        cv2.circle(markers, c, 10, i, -1)
        cv2.circle(relief, c, 14, 0, -1)  # точка стоит на гербе/звёздах — это не стена
        for ex, ey in SEED_EXTRA.get(pid, []):
            cv2.circle(markers, (int(ex * K), int(ey * K)), 8, i, -1)
            cv2.circle(relief, (int(ex * K), int(ey * K)), 12, 0, -1)
    sea = len(ids) + 1
    for x, y in SEA:
        cv2.circle(markers, (int(x * K), int(y * K)), 8, sea, -1)
    # Рамка поля и полоса легенды снизу — тоже «не провинция».
    markers[-3:, :] = sea; markers[:, -3:] = sea  # верх карты — суша до самой рамки
    markers[int(855 * K):, :] = sea
    markers[:, int(575 * K):] = sea  # цветные закладки кланов у правого края
    ws = flood(relief, markers)
    out = {}
    for i, pid in enumerate(ids, start=1):
        m = (ws == i).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))  # без «ниток» по линиям
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        # Провинция может состоять из нескольких кусков (острова, полуостров): пишем все заметные,
        # не раздувая их закрытием — иначе контур наползает на соседей.
        parts = sorted([c for c in cs if cv2.contourArea(c) > 400], key=cv2.contourArea, reverse=True)
        out[pid] = [[[round(float(x) / K, 1), round(float(y) / K, 1)] for x, y in cv2.approxPolyDP(c, 1.0, True)[:, 0]]
                    for c in parts]
        print(pid, len(parts), int(sum(cv2.contourArea(c) for c in parts) / K / K))
    data['borders'] = border_points(ws, ids)
    data['regions'] = out
    POINTS.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    if preview:
        vis = img.copy()
        rng = np.random.default_rng(3)
        for i in range(1, len(ids) + 1):
            col = rng.integers(40, 255, 3).tolist()
            vis[ws == i] = (vis[ws == i] * 0.45 + np.array(col) * 0.55).astype(np.uint8)
        vis[ws == len(ids) + 1] = (vis[ws == len(ids) + 1] * 0.25).astype(np.uint8)
        edge = cv2.morphologyEx(ws.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
        vis[edge] = (0, 0, 255)
        for x, y in SEA:
            cv2.circle(vis, (int(x * K), int(y * K)), 6, (255, 0, 0), -1)
        cv2.imwrite(sys.argv[2] if len(sys.argv) > 2 else 'provinces-preview.png', vis)
        cv2.imwrite((sys.argv[2] if len(sys.argv) > 2 else 'provinces').replace('.png', '-lines.png'), line)


if __name__ == '__main__':
    main('--preview' in sys.argv)
