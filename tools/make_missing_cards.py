"""Рисует карты территорий, которых нет среди сканов (Пиратские набеги, Шпионская сеть), в стиле остальных карт.

Берём фон настоящей карты, стираем её текст размытием и пишем свой заголовок, текст и жетон.
python tools/make_missing_cards.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ART = Path(__file__).resolve().parents[1] / 'packages' / 'client' / 'public' / 'art'
FONTS = Path('C:/Windows/Fonts')


def font(name, size):
    try:
        return ImageFont.truetype(str(FONTS / name), size)
    except OSError:
        return ImageFont.load_default()


def wrap(draw, text, f, width):
    lines, line = [], ''
    for word in text.split():
        test = (line + ' ' + word).strip()
        if draw.textlength(test, font=f) > width and line:
            lines.append(line)
            line = word
        else:
            line = test
    return lines + [line]


def card(base, out, title, text, token=None, emblem=None):
    im = Image.open(ART / 'cards' / base).convert('RGB')
    w, h = im.size
    # Стираем текст и картинку: середину заменяем сильно размытой копией бумаги.
    blurred = im.filter(ImageFilter.GaussianBlur(28))
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((18, 60, w - 18, h - 120), 40, fill=255)
    im.paste(blurred, (0, 0), mask.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(im)
    if emblem:
        e = Image.open(ART / 'emblems' / emblem).convert('RGBA').resize((64, 64))
        im.paste(e, (w // 2 - 32, 62), e)
    tf = font('segoeprb.ttf', 30)
    tw = d.textlength(title, font=tf)
    d.text(((w - tw) / 2, 140), title, font=tf, fill='#1b1712')
    d.line((60, 192, w - 60, 192), fill='#b9b4ac', width=1)
    bf = font('segoeui.ttf', 19)
    y = 208
    for line in wrap(d, text, bf, w - 80):
        lw = d.textlength(line, font=bf)
        d.text(((w - lw) / 2, y), line, font=bf, fill='#2b2925')
        y += 28
    if token:
        t = Image.open(ART / 'specials' / token).convert('RGBA').resize((110, 110))
        im.paste(t, (w // 2 - 55, max(y + 20, 340)), t)
    im.save(ART / 'cards' / out, quality=90)
    print('written', out)


card('port.webp', 'pirates.webp', 'Пиратские набеги',
     'Выбери провинцию и размести в ней жетон выжженной земли. Если провинция была твоей, '
     'добавь 3 открытых жетона контроля в другую свою провинцию.', token='scorched.webp')
card('exchange.webp', 'spy.webp', 'Шпионская сеть',
     'Посмотри все жетоны за ширмой одного соперника. Его жетон блефа недоступен до конца раунда.',
     emblem='scorpion.webp')
