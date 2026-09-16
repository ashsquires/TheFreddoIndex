"""Resize the branded frog icon and create the share card; requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)
PURPLE = '#330072'


def frog_icon(size):
    with Image.open(OUT / 'freddo-frog-icon-master.png') as source:
        return source.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)


frog_icon(96).save(OUT / 'favicon-frog-96.png', optimize=True)
frog_icon(180).save(OUT / 'apple-touch-frog.png', optimize=True)
frog_icon(256).save(OUT / 'favicon-frog.png', optimize=True)
# Keep the previous URLs serving the new artwork for existing bookmarks and crawlers.
frog_icon(96).save(OUT / 'favicon-96.png', optimize=True)
frog_icon(180).save(OUT / 'apple-touch-icon.png', optimize=True)
frog_icon(256).save(OUT / 'favicon.png', optimize=True)
card = Image.new('RGB', (1200, 630), '#faf8fc')
d = ImageDraw.Draw(card)
font_dir = Path('/System/Library/Fonts/Supplemental')
def font(size, bold=False):
    return ImageFont.truetype(str(font_dir / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)
d.rounded_rectangle((55, 52, 145, 142), radius=20, fill=PURPLE)
card.paste(frog_icon(80), (60, 57))
d.text((170, 64), 'THE ORIGINAL', fill=PURPLE, font=font(20, True))
d.text((169, 91), 'Freddo Index', fill=PURPLE, font=font(38, True))
d.text((60, 210), 'One small frog.', fill=PURPLE, font=font(76, True))
d.text((60, 302), 'One big price rise.', fill='#7650b4', font=font(76, True))
d.text((64, 433), 'Freddo price history meets UK inflation.', fill='#665873', font=font(29))
d.line((64, 512, 1136, 512), fill='#e3d8ee', width=2)
d.text((64, 549), 'thefreddoindex.com', fill=PURPLE, font=font(23, True))
d.text((764, 549), 'Price history since 1995', fill='#665873', font=font(21))
card.save(OUT / 'freddo-index-social.png', optimize=True)
