from __future__ import annotations

import json
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "images"
OUT.mkdir(parents=True, exist_ok=True)
RNG = random.Random(4174)

PAPER = (232, 231, 220)
INK = (34, 52, 46)
GREEN = (50, 91, 79)
TEAL = (64, 120, 116)
RUST = (166, 78, 58)
GOLD = (199, 165, 89)
CHARCOAL = (39, 45, 43)


def font(size: int, bold: bool = False):
    names = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def gradient(size, top, bottom):
    image = Image.new("RGB", size, top)
    pixels = image.load()
    for y in range(size[1]):
        ratio = y / max(1, size[1] - 1)
        color = tuple(round(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3))
        for x in range(size[0]):
            pixels[x, y] = color
    return image


def finish(image: Image.Image, filename: str, quality=88):
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for _ in range(max(400, image.width * image.height // 1200)):
        x = RNG.randrange(image.width)
        y = RNG.randrange(image.height)
        shade = RNG.choice([(255, 255, 255, 8), (20, 28, 25, 7)])
        draw.point((x, y), fill=shade)
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    image = ImageEnhance.Contrast(image).enhance(1.03)
    image.save(OUT / filename, "JPEG", quality=quality, optimize=True, progressive=True)


def wall_art(draw, box, palette, title=None):
    x1, y1, x2, y2 = box
    draw.rectangle(box, fill=(48, 43, 37), outline=(224, 218, 201), width=8)
    draw.rectangle((x1 + 18, y1 + 18, x2 - 18, y2 - 18), fill=palette[0])
    cx = (x1 + x2) // 2
    draw.polygon([(x1 + 30, y2 - 30), (cx - 20, y1 + 55), (x2 - 25, y2 - 70)], fill=palette[1])
    draw.ellipse((cx - 70, y1 + 60, cx + 80, y1 + 210), fill=palette[2])
    draw.line((x1 + 45, y2 - 90, x2 - 45, y1 + 95), fill=palette[3], width=18)
    if title:
        draw.text((x1 + 22, y2 + 12), title, font=font(22, True), fill=(63, 70, 66))


def gallery_scene():
    w, h = 1600, 1000
    image = gradient((w, h), (198, 205, 197), (104, 116, 108))
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 0), (w, 0), (1310, 210), (275, 210)], fill=(230, 229, 220))
    draw.polygon([(0, 0), (275, 210), (275, 790), (0, h)], fill=(183, 190, 182))
    draw.polygon([(w, 0), (1310, 210), (1310, 790), (w, h)], fill=(159, 170, 163))
    draw.rectangle((275, 210, 1310, 790), fill=(219, 219, 207))
    draw.polygon([(0, h), (275, 790), (1310, 790), (w, h)], fill=(91, 103, 97))
    for x in range(330, 1270, 170):
        draw.rectangle((x, 105, x + 88, 132), fill=(251, 242, 206))
        draw.ellipse((x + 15, 120, x + 72, 225), fill=(255, 245, 208))
    wall_art(draw, (660, 285, 990, 675), [(196, 205, 188), RUST, (47, 84, 74), GOLD], "RUNWAY / No. 01")
    wall_art(draw, (350, 345, 545, 600), [(205, 194, 177), (74, 105, 98), GOLD, RUST])
    wall_art(draw, (1100, 350, 1250, 575), [(181, 192, 190), (99, 72, 65), (202, 174, 113), (48, 91, 82)])
    draw.rectangle((675, 690, 975, 740), fill=(244, 242, 230), outline=(95, 104, 99), width=2)
    draw.text((706, 704), "PRIZE EXHIBITION / 01", font=font(19, True), fill=INK)
    draw.rounded_rectangle((84, 720, 330, 920), radius=9, fill=(48, 63, 57), outline=(212, 217, 205), width=3)
    draw.text((111, 752), "INSTALLATION", font=font(24, True), fill=(238, 234, 218))
    draw.rectangle((118, 802, 292, 880), fill=(213, 211, 194))
    draw.line((143, 866, 258, 816), fill=RUST, width=9)
    finish(image, "location-gallery.jpg", 90)


def printer_scene():
    w, h = 1600, 1000
    image = gradient((w, h), (171, 189, 184), (63, 76, 72))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, w, 680), fill=(201, 211, 205))
    draw.rectangle((0, 680, w, h), fill=(74, 83, 79))
    for x in range(0, w, 160):
        draw.line((x, 680, x + 80, h), fill=(96, 104, 100), width=3)
    draw.rectangle((270, 255, 1325, 745), fill=(64, 76, 72), outline=(30, 40, 36), width=8)
    draw.rectangle((335, 315, 1240, 590), fill=(219, 224, 217), outline=(134, 143, 138), width=5)
    draw.rectangle((390, 370, 1030, 523), fill=(49, 60, 56))
    draw.rectangle((440, 398, 978, 495), fill=(203, 176, 106))
    draw.line((470, 478, 917, 415), fill=RUST, width=20)
    draw.ellipse((610, 408, 760, 485), fill=GREEN)
    draw.rounded_rectangle((1065, 350, 1195, 540), radius=7, fill=(28, 40, 36))
    draw.rectangle((1084, 378, 1176, 434), fill=(90, 149, 132))
    draw.text((1095, 391), "20:48", font=font(20, True), fill=(231, 243, 235))
    for y in range(460, 520, 22):
        draw.ellipse((1090, y, 1103, y + 13), fill=GOLD)
        draw.line((1115, y + 7, 1164, y + 7), fill=(179, 185, 180), width=4)
    draw.rectangle((235, 720, 390, 935), fill=(45, 52, 49), outline=(127, 136, 131), width=4)
    draw.polygon([(250, 745), (380, 745), (356, 925), (270, 925)], fill=(75, 82, 78))
    draw.text((285, 825), "PROOF", font=font(18, True), fill=(188, 193, 187))
    finish(image, "location-print-room.jpg")


def corridor_scene():
    w, h = 1600, 1000
    image = gradient((w, h), (197, 208, 204), (73, 89, 84))
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, 0), (1600, 0), (1030, 350), (590, 350)], fill=(233, 233, 223))
    draw.polygon([(0, 0), (590, 350), (590, 690), (0, 1000)], fill=(155, 174, 167))
    draw.polygon([(1600, 0), (1030, 350), (1030, 690), (1600, 1000)], fill=(134, 155, 148))
    draw.rectangle((590, 350, 1030, 690), fill=(99, 119, 112))
    draw.polygon([(0, 1000), (590, 690), (1030, 690), (1600, 1000)], fill=(74, 85, 81))
    draw.rectangle((1260, 260, 1432, 720), fill=(47, 66, 59), outline=(213, 218, 207), width=7)
    draw.rectangle((1305, 345, 1390, 480), fill=(32, 42, 38), outline=(92, 105, 98), width=4)
    draw.rectangle((1323, 370, 1372, 406), fill=(94, 164, 140))
    draw.text((1329, 378), "CARD", font=font(13, True), fill=(232, 241, 232))
    draw.ellipse((1340, 442, 1355, 457), fill=GOLD)
    draw.rectangle((128, 260, 455, 680), fill=(225, 224, 210), outline=(86, 102, 95), width=7)
    draw.rectangle((166, 305, 418, 625), fill=(244, 241, 225))
    draw.text((194, 337), "DUTY ROSTER", font=font(26, True), fill=INK)
    for y in range(405, 584, 42):
        draw.line((198, y, 388, y), fill=(130, 138, 132), width=3)
    for x in [670, 815, 950]:
        draw.rectangle((x, 180, x + 70, 206), fill=(255, 242, 194))
    finish(image, "location-corridor.jpg")


def storage_scene():
    w, h = 1600, 1000
    image = gradient((w, h), (133, 127, 111), (48, 52, 48))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, w, 690), fill=(143, 139, 123))
    draw.rectangle((0, 690, w, h), fill=(60, 61, 55))
    draw.rectangle((680, 125, 1395, 845), fill=(54, 62, 57), outline=(28, 35, 31), width=10)
    for x in [702, 935, 1168]:
        draw.rectangle((x, 160, x + 210, 815), fill=(68, 78, 71), outline=(115, 124, 116), width=4)
        for y in [330, 515, 690]:
            draw.line((x, y, x + 210, y), fill=(117, 126, 117), width=4)
        draw.ellipse((x + 180, 470, x + 194, 484), fill=GOLD)
    draw.rectangle((1015, 370, 1092, 570), fill=(32, 38, 34), outline=(161, 151, 111), width=4)
    draw.arc((1028, 335, 1080, 413), 180, 360, fill=GOLD, width=8)
    draw.rectangle((90, 665, 482, 890), fill=(91, 78, 58), outline=(38, 38, 33), width=6)
    draw.rectangle((124, 702, 452, 858), fill=(220, 210, 183))
    draw.text((158, 728), "MATERIAL CHECKOUT", font=font(23, True), fill=(76, 67, 54))
    for y in range(785, 840, 24):
        draw.line((150, y, 420, y), fill=(128, 115, 92), width=3)
    for x, y, color in [(210, 210, TEAL), (345, 285, RUST), (500, 170, GOLD)]:
        draw.rectangle((x, y, x + 85, y + 420), fill=(76, 68, 55))
        draw.ellipse((x - 5, y - 20, x + 90, y + 45), fill=color)
    finish(image, "location-storage.jpg")


def portrait(filename, skin, hair, shirt, accent, style, variant):
    scale = 2
    w, h = 800 * scale, 900 * scale

    def box(values):
        return tuple(int(value * scale) for value in values)

    def points(values):
        return [(int(x * scale), int(y * scale)) for x, y in values]

    def width(value):
        return max(1, int(value * scale))

    def shade(color, amount):
        return tuple(max(0, min(255, round(channel * amount))) for channel in color)

    def blend(first, second, ratio):
        return tuple(round(first[i] * (1 - ratio) + second[i] * ratio) for i in range(3))

    traditional_female = variant in {"lin", "su"}

    background = gradient((800, 900), (222, 227, 221), (102, 117, 110)).resize((w, h), Image.Resampling.LANCZOS).convert("RGBA")
    draw = ImageDraw.Draw(background, "RGBA")

    # Quiet editorial backdrop with a subtle case-file grid.
    draw.rectangle(box((0, 620, 800, 900)), fill=(30, 55, 47, 255))
    draw.ellipse(box((115, 72, 685, 690)), fill=(238, 235, 222, 90), outline=(255, 255, 255, 70), width=width(2))
    for x in range(70, 760, 90):
        draw.line(box((x, 112, x, 620)), fill=(255, 255, 255, 18), width=width(1))
    for y in range(130, 610, 80):
        draw.line(box((55, y, 745, y)), fill=(255, 255, 255, 14), width=width(1))
    draw.rounded_rectangle(box((34, 35, 252, 96)), radius=width(6), fill=(31, 58, 49, 245))
    draw.text(box((53, 52)), f"WITNESS / {variant.upper()}", font=font(19 * scale, True), fill=(244, 239, 220, 255))

    shadow_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer, "RGBA")
    shadow_draw.ellipse(box((168, 180, 642, 885)), fill=(13, 25, 21, 105))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(width(24)))
    background = Image.alpha_composite(background, shadow_layer)
    draw = ImageDraw.Draw(background, "RGBA")

    # Torso and layered clothing.
    draw.polygon(points([(94, 900), (178, 684), (294, 602), (506, 602), (622, 684), (706, 900)]), fill=(*shade(shirt, .78), 255))
    draw.polygon(points([(150, 900), (205, 665), (332, 615), (400, 705), (468, 615), (595, 665), (650, 900)]), fill=(*shirt, 255))
    draw.rectangle(box((344, 518, 456, 665)), fill=(*shade(skin, .92), 255))
    draw.ellipse(box((331, 585, 469, 688)), fill=(*shade(skin, .92), 255))
    draw.polygon(points([(304, 615), (400, 702), (496, 615), (466, 684), (400, 742), (334, 684)]), fill=(244, 240, 226, 245))
    draw.line(box((400, 709, 400, 900)), fill=(*accent, 245), width=width(5))

    if variant == "lin":
        draw.polygon(points([(304, 616), (400, 702), (345, 764), (255, 648)]), fill=(*shade(shirt, .9), 255))
        draw.polygon(points([(496, 616), (400, 702), (455, 764), (545, 648)]), fill=(*shade(shirt, .9), 255))
        draw.ellipse(box((386, 704, 414, 732)), fill=(*GOLD, 255))
    elif variant == "su":
        draw.polygon(points([(260, 650), (400, 760), (540, 650), (505, 900), (295, 900)]), fill=(*shade(shirt, .88), 255))
        draw.line(box((280, 690, 515, 854)), fill=(*GOLD, 210), width=width(3))
    elif variant == "he":
        draw.polygon(points([(185, 680), (310, 630), (342, 900), (185, 900)]), fill=(45, 57, 72, 255))
        draw.polygon(points([(615, 680), (490, 630), (458, 900), (615, 900)]), fill=(45, 57, 72, 255))
        draw.line(box((255, 650, 485, 900)), fill=(43, 42, 37, 220), width=width(11))
        draw.rounded_rectangle(box((475, 744, 545, 795)), radius=width(7), fill=(32, 38, 36, 255), outline=(*GOLD, 220), width=width(2))
        draw.ellipse(box((493, 757, 529, 791)), fill=(22, 26, 25, 255), outline=(154, 165, 158, 255), width=width(2))
    else:
        draw.polygon(points([(307, 621), (400, 706), (356, 754), (279, 661)]), fill=(225, 218, 198, 255))
        draw.polygon(points([(493, 621), (400, 706), (444, 754), (521, 661)]), fill=(225, 218, 198, 255))
        for y in (742, 802, 862):
            draw.ellipse(box((390, y, 410, y + 20)), fill=(*shade(accent, .82), 255))
        draw.rounded_rectangle(box((505, 700, 558, 766)), radius=width(4), fill=(229, 228, 212, 255), outline=(*accent, 255), width=width(2))

    # Hair mass behind the face.
    if style == "long":
        draw.ellipse(box((174, 85, 626, 682)), fill=(*shade(hair, .73), 255))
        draw.polygon(points([(190, 300), (270, 220), (248, 742), (143, 820), (180, 535)]), fill=(*hair, 255))
        draw.polygon(points([(610, 300), (530, 220), (552, 742), (657, 820), (620, 535)]), fill=(*shade(hair, .88), 255))
    elif style == "bob":
        draw.ellipse(box((188, 92, 612, 650)), fill=(*shade(hair, .74), 255))
        draw.rounded_rectangle(box((197, 275, 603, 672)), radius=width(58), fill=(*hair, 255))
    else:
        draw.ellipse(box((215, 110, 585, 575)), fill=(*shade(hair, .76), 255))

    # Ears and face silhouette. Female witnesses use a refined oval face with a tapered jaw.
    if traditional_female:
        draw.ellipse(box((226, 304, 275, 426)), fill=(*shade(skin, .92), 255))
        draw.ellipse(box((525, 304, 574, 426)), fill=(*shade(skin, .86), 255))
        draw.ellipse(box((252, 150, 548, 545)), fill=(*skin, 255))
        draw.polygon(points([(260, 306), (278, 470), (318, 566), (400, 625), (482, 566), (522, 470), (540, 306)]), fill=(*skin, 255))
        draw.ellipse(box((286, 426, 514, 594)), fill=(*skin, 255))
    else:
        draw.ellipse(box((213, 300, 279, 435)), fill=(*shade(skin, .91), 255))
        draw.ellipse(box((521, 300, 587, 435)), fill=(*shade(skin, .84), 255))
        draw.ellipse(box((238, 145, 562, 585)), fill=(*skin, 255))
        draw.ellipse(box((270, 390, 530, 620)), fill=(*skin, 255))
        draw.polygon(points([(256, 330), (285, 545), (400, 625), (515, 545), (544, 330)]), fill=(*skin, 255))

    # Soft face modelling.
    draw.ellipse(box((428, 185, 542, 548)), fill=(*shade(skin, .965), 58))
    blush = blend(skin, (176, 82, 84), .34)
    draw.ellipse(box((286, 391, 340, 421)), fill=(*blush, 82))
    draw.ellipse(box((460, 391, 514, 421)), fill=(*blush, 70))

    brow = shade(hair, .68)
    eye = (43, 48, 45)
    iris = shade(accent, .72)
    if traditional_female:
        draw.arc(box((282, 282, 366, 319)), 192, 346, fill=(*brow, 255), width=width(4))
        draw.arc(box((434, 282, 518, 319)), 194, 348, fill=(*brow, 255), width=width(4))
        draw.line(box((294, 303, 350, 295)), fill=(*brow, 105), width=width(2))
        draw.line(box((450, 295, 506, 303)), fill=(*brow, 105), width=width(2))
    elif variant == "he":
        draw.line(box((292, 307, 358, 296)), fill=(*brow, 255), width=width(8))
        draw.line(box((442, 296, 509, 307)), fill=(*brow, 255), width=width(8))
    else:
        draw.line(box((292, 297, 360, 296)), fill=(*brow, 255), width=width(7))
        draw.line(box((440, 296, 508, 297)), fill=(*brow, 255), width=width(7))

    eye_lefts = (292, 450) if traditional_female else (300, 448)
    eye_width = 66 if traditional_female else 62
    eye_height = 31 if traditional_female else 36
    for left in eye_lefts:
        top = 328 if traditional_female else 325
        draw.ellipse(box((left, top, left + eye_width, top + eye_height)), fill=(248, 245, 236, 255), outline=(*shade(skin, .67), 145), width=width(2))
        iris_left = left + (22 if traditional_female else 19)
        draw.ellipse(box((iris_left, top + 1, iris_left + 27, top + eye_height - 1)), fill=(*iris, 255))
        draw.ellipse(box((iris_left + 9, top + 5, iris_left + 24, top + eye_height - 4)), fill=(*eye, 255))
        draw.ellipse(box((iris_left + 14, top + 7, iris_left + 20, top + 13)), fill=(255, 255, 249, 245))
        draw.arc(box((left - 2, top - 9, left + eye_width + 2, top + eye_height + 1)), 184, 354, fill=(*eye, 230), width=width(3 if traditional_female else 3))
        if traditional_female:
            draw.line(box((left + eye_width - 3, top + 8, left + eye_width + 9, top + 3)), fill=(*eye, 195), width=width(2))

    if variant == "chen":
        draw.rounded_rectangle(box((280, 311, 379, 372)), radius=width(17), outline=(51, 61, 57, 235), width=width(5))
        draw.rounded_rectangle(box((421, 311, 520, 372)), radius=width(17), outline=(51, 61, 57, 235), width=width(5))
        draw.line(box((379, 337, 421, 337)), fill=(51, 61, 57, 235), width=width(5))

    if traditional_female:
        draw.line(box((401, 358, 395, 414)), fill=(*shade(skin, .72), 150), width=width(2))
        draw.arc(box((384, 398, 416, 438)), 22, 150, fill=(*shade(skin, .68), 150), width=width(2))
        draw.ellipse(box((390, 437, 410, 445)), fill=(160, 86, 84, 100))
    else:
        draw.line(box((404, 355, 392, 430)), fill=(*shade(skin, .64), 185), width=width(3))
        draw.arc(box((378, 405, 425, 450)), 28, 142, fill=(*shade(skin, .65), 185), width=width(3))
        draw.ellipse(box((386, 442, 417, 454)), fill=(164, 85, 82, 150))

    mouth_color = (127, 66, 68)
    if variant == "lin":
        draw.arc(box((366, 466, 436, 510)), 18, 162, fill=(*mouth_color, 235), width=width(3))
        draw.ellipse(box((383, 495, 419, 504)), fill=(164, 84, 88, 90))
    elif variant == "su":
        draw.arc(box((363, 464, 439, 512)), 12, 168, fill=(*mouth_color, 245), width=width(3))
        draw.ellipse(box((381, 496, 421, 506)), fill=(171, 91, 93, 90))
    elif variant == "he":
        draw.line(box((358, 493, 444, 489)), fill=(*mouth_color, 255), width=width(4))
        draw.arc(box((358, 466, 454, 515)), 20, 110, fill=(*mouth_color, 190), width=width(3))
    else:
        draw.arc(box((350, 459, 452, 519)), 22, 158, fill=(*mouth_color, 230), width=width(4))

    # Front hair and highlights create distinct silhouettes.
    if style == "long":
        draw.polygon(points([(220, 270), (245, 125), (404, 82), (568, 152), (585, 270), (508, 216), (425, 183), (333, 218)]), fill=(*hair, 255))
        draw.polygon(points([(250, 134), (332, 102), (278, 280), (235, 330)]), fill=(*shade(hair, .83), 255))
        draw.arc(box((187, 150, 318, 695)), 84, 264, fill=(255, 255, 255, 35), width=width(8))
    elif style == "bob":
        draw.pieslice(box((210, 92, 590, 390)), 180, 358, fill=(*hair, 255))
        draw.polygon(points([(220, 220), (350, 105), (318, 318), (250, 372)]), fill=(*shade(hair, .85), 255))
        draw.arc(box((208, 125, 315, 615)), 85, 265, fill=(255, 255, 255, 34), width=width(7))
    elif variant == "he":
        draw.polygon(points([(214, 250), (236, 142), (320, 82), (392, 108), (454, 72), (548, 122), (588, 252), (520, 212), (455, 178), (386, 202), (318, 180)]), fill=(*hair, 255))
        draw.line(box((280, 132, 365, 104)), fill=(255, 255, 255, 34), width=width(7))
    else:
        draw.polygon(points([(218, 248), (246, 136), (352, 87), (487, 108), (582, 180), (578, 256), (500, 203), (418, 176), (329, 211)]), fill=(*hair, 255))
        draw.polygon(points([(411, 107), (533, 139), (484, 207), (405, 177)]), fill=(*shade(hair, .86), 255))
        draw.line(box((276, 137, 365, 106)), fill=(255, 255, 255, 32), width=width(7))

    # Small role-specific details.
    if variant == "lin":
        draw.ellipse(box((535, 250, 555, 270)), fill=(*GOLD, 255))
        draw.ellipse(box((535, 277, 553, 295)), fill=(*GOLD, 255))
    elif variant == "su":
        draw.line(box((255, 650, 315, 720)), fill=(*GOLD, 215), width=width(4))
        draw.ellipse(box((300, 705, 326, 731)), fill=(*GOLD, 255))
    elif variant == "he":
        draw.rectangle(box((230, 735, 292, 755)), fill=(*RUST, 235))
    else:
        draw.line(box((525, 693, 525, 765)), fill=(*accent, 255), width=width(3))

    image = background.convert("RGB").resize((800, 900), Image.Resampling.LANCZOS)
    finish(image, filename, 93)


def evidence_card(filename, title, kind):
    w, h = 1200, 750
    image = gradient((w, h), (224, 224, 213), (113, 123, 116))
    draw = ImageDraw.Draw(image)
    draw.rectangle((45, 40, 1155, 710), fill=(235, 233, 218), outline=(54, 70, 63), width=5)
    draw.rectangle((45, 40, 1155, 110), fill=INK)
    draw.text((74, 61), title.upper(), font=font(25, True), fill=(240, 236, 219))
    draw.text((978, 66), "E-04/17", font=font(18, True), fill=GOLD)
    if kind == "frame":
        draw.rectangle((260, 170, 940, 615), fill=(78, 65, 49), outline=(42, 42, 36), width=18)
        draw.rectangle((318, 220, 882, 565), fill=(198, 188, 160))
        for x in [328, 485, 642, 799]:
            draw.arc((x, 182, x + 72, 250), 190, 350, fill=RUST, width=7)
            draw.arc((x + 8, 194, x + 80, 262), 190, 350, fill=(74, 110, 97), width=5)
    elif kind == "dots":
        for y in range(175, 615, 25):
            for x in range(180, 1020, 25):
                color = [(43, 155, 169), (196, 60, 107), (230, 193, 40), (35, 40, 39)][(x // 25 + y // 25) % 4]
                draw.ellipse((x, y, x + 11, y + 11), fill=color)
        draw.ellipse((410, 255, 810, 575), outline=(245, 241, 222), width=18)
    elif kind == "signature":
        draw.rectangle((135, 155, 1065, 640), fill=(194, 186, 156))
        draw.polygon([(170, 580), (520, 220), (1020, 540)], fill=(91, 119, 102))
        draw.ellipse((520, 230, 850, 530), fill=RUST)
        draw.text((880, 565), "S.W.", font=font(52, True), fill=(55, 51, 44))
    elif kind in {"log", "record", "duty"}:
        draw.rectangle((145, 150, 1055, 640), fill=(250, 247, 230), outline=(125, 128, 113), width=4)
        for y in range(220, 610, 55):
            draw.line((180, y, 1015, y), fill=(172, 174, 158), width=2)
        for x in [430, 690, 900]:
            draw.line((x, 185, x, 610), fill=(190, 191, 174), width=2)
        rows = ["20:30", "20:41", "20:48", "21:02"]
        for i, value in enumerate(rows):
            draw.text((205, 235 + i * 76), value, font=font(28, i == 2), fill=RUST if i == 2 else INK)
            draw.text((470, 235 + i * 76), ["DUTY OUT", "CARD IN", "RUNWAY_V7", "FRAME ACCESS"][i], font=font(25), fill=INK)
    elif kind == "proof":
        draw.rectangle((140, 150, 1060, 635), fill=(196, 181, 144), outline=(73, 67, 54), width=5)
        draw.line((210, 550, 980, 230), fill=RUST, width=34)
        draw.ellipse((455, 235, 730, 525), fill=GREEN)
        draw.text((745, 540), "+6% LIGHT", font=font(34, True), fill=(76, 58, 49))
    elif kind == "sketch":
        draw.rectangle((125, 135, 1075, 650), fill=(242, 236, 211), outline=(126, 116, 91), width=5)
        for _ in range(35):
            x1 = RNG.randint(180, 950); y1 = RNG.randint(180, 580)
            x2 = x1 + RNG.randint(-130, 150); y2 = y1 + RNG.randint(-90, 120)
            draw.line((x1, y1, x2, y2), fill=(90, 84, 70), width=RNG.randint(1, 4))
        draw.text((180, 555), "LIN XIA + SU WAN / STUDY 03", font=font(27, True), fill=RUST)
    elif kind == "original":
        draw.rectangle((170, 145, 1030, 650), fill=(55, 49, 39), outline=(207, 195, 161), width=15)
        draw.rectangle((208, 185, 992, 610), fill=(192, 189, 161))
        draw.polygon([(225, 575), (540, 210), (960, 555)], fill=GREEN)
        draw.ellipse((470, 215, 760, 520), fill=RUST)
        draw.line((270, 560, 940, 230), fill=GOLD, width=24)
        draw.text((870, 550), "S.W.", font=font(34, True), fill=(53, 48, 40))
    finish(image, filename, 88)


def main():
    gallery_scene(); printer_scene(); corridor_scene(); storage_scene()
    portrait("character-lin-xia.jpg", (222, 179, 151), (42, 31, 31), (145, 69, 57), GOLD, "long", "lin")
    portrait("character-su-wan.jpg", (230, 186, 158), (36, 29, 30), (48, 116, 109), GOLD, "bob", "su")
    portrait("character-he-yu.jpg", (216, 171, 142), (35, 31, 29), (65, 78, 111), RUST, "short", "he")
    portrait("character-chen-mo.jpg", (223, 182, 153), (44, 37, 34), (104, 84, 58), TEAL, "short", "chen")
    evidence_card("evidence-frame.jpg", "Frame latch marks", "frame")
    evidence_card("evidence-print-dots.jpg", "CMYK print pattern", "dots")
    evidence_card("evidence-signature.jpg", "Original installation photo", "signature")
    evidence_card("evidence-print-log.jpg", "Printer job history", "log")
    evidence_card("evidence-proof.jpg", "Discarded color proof", "proof")
    evidence_card("evidence-access.jpg", "East wing access log", "log")
    evidence_card("evidence-duty.jpg", "Volunteer duty change", "duty")
    evidence_card("evidence-sketch.jpg", "Shared composition study", "sketch")
    evidence_card("evidence-record.jpg", "Material room checkout", "record")
    evidence_card("evidence-original.jpg", "Recovered original painting", "original")

    files = sorted(path.name for path in OUT.glob("*.jpg"))
    credits = {
        "generatedAt": "2026-08-05",
        "licenseNote": "Project-original generated bitmap illustrations. No external source images were used. Redistribution follows the repository owner's project license and permissions.",
        "generator": "xiaoyuanmian/scripts/generate_assets.py using Pillow",
        "assets": [
            {
                "file": name,
                "purpose": "location scene" if name.startswith("location-") else "character portrait" if name.startswith("character-") else "evidence close-up",
                "creator": "AI Game project",
                "source": "Original procedural illustration",
                "sourceUrl": None,
                "license": "Project original",
                "date": "2026-08-05",
                "modifications": "Deterministically rendered and compressed as a local JPEG asset.",
            }
            for name in files
        ],
    }
    (OUT / "credits.json").write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(files)} images in {OUT}")


if __name__ == "__main__":
    main()
