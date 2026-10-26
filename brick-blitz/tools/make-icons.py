#!/usr/bin/env python3
"""Draws the app icons (icons/*.png): a glowing brick wall, a ball and a paddle."""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'icons')
ROWS = [('#ff3fd2', '#a0107a'), ('#22e6ff', '#0b6a9a'), ('#ffd23a', '#b07a00')]


def icon(size, pad):
    S = size * 4  # draw large, then shrink for smooth edges
    img = Image.new('RGB', (S, S), '#140733')
    d = ImageDraw.Draw(img)
    for y in range(S):  # background gradient
        t = y / S
        d.line([(0, y), (S, y)], fill=(int(20 + 38 * t), int(7 + 4 * t), int(51 + 31 * t)))
    inner = S * (1 - 2 * pad)
    x0 = y0 = S * pad
    bw, bh, gap = inner / 4, inner / 8.5, inner * 0.025
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    for r, (top, bot) in enumerate(ROWS):
        off = (bw / 2) if r % 2 else 0
        for c in range(-1, 5):
            bx = x0 + c * bw + off
            if bx + bw < x0 or bx > x0 + inner:
                continue
            box = [max(x0, bx + gap), y0 + inner * 0.08 + r * (bh + gap), min(x0 + inner, bx + bw - gap), y0 + inner * 0.08 + r * (bh + gap) + bh]
            if box[2] - box[0] < bw * 0.3:
                continue
            g.rounded_rectangle(box, radius=bh * 0.25, fill=top)
            d.rounded_rectangle(box, radius=bh * 0.25, fill=bot)
            hi = [box[0] + bh * 0.12, box[1] + bh * 0.1, box[2] - bh * 0.12, box[1] + bh * 0.5]
            d.rounded_rectangle(hi, radius=bh * 0.2, fill=top)
    # paddle and ball
    px0, px1, py = x0 + inner * 0.22, x0 + inner * 0.78, y0 + inner * 0.84
    g.rounded_rectangle([px0, py, px1, py + inner * 0.09], radius=inner * 0.045, fill='#22e6ff')
    d.rounded_rectangle([px0, py, px1, py + inner * 0.09], radius=inner * 0.045, fill='#139fd0')
    d.rounded_rectangle([px0 + inner * 0.03, py + inner * 0.012, px1 - inner * 0.03, py + inner * 0.04], radius=inner * 0.015, fill='#bff6ff')
    br = inner * 0.075
    bx, by = x0 + inner * 0.6, y0 + inner * 0.58
    for i in range(6, 0, -1):
        k = i / 7
        tx, ty = bx - i * br * 0.75, by + i * br * 0.6
        g.ellipse([tx - br * (1 - k * 0.6), ty - br * (1 - k * 0.6), tx + br * (1 - k * 0.6), ty + br * (1 - k * 0.6)], fill=(127, 246, 255, int(200 * (1 - k))))
    g.ellipse([bx - br * 1.6, by - br * 1.6, bx + br * 1.6, by + br * 1.6], fill=(255, 255, 255, 160))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.02))
    img = Image.alpha_composite(img.convert('RGBA'), glow)
    d = ImageDraw.Draw(img)
    d.ellipse([bx - br, by - br, bx + br, by + br], fill='#ffffff')
    return img.resize((size, size), Image.LANCZOS).convert('RGB')


os.makedirs(OUT, exist_ok=True)
icon(192, 0.1).save(os.path.join(OUT, 'icon-192.png'))
icon(512, 0.1).save(os.path.join(OUT, 'icon-512.png'))
icon(512, 0.2).save(os.path.join(OUT, 'maskable-512.png'))
print('icons written')
