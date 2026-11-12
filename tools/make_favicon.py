"""The site icon: a cube whose three faces are the index's three dimensions (writing amber on top,
data teal at the side, technology indigo in front), with LT / DI in Lora Bold turned into outlines.
Run:  python tools/make_favicon.py   (needs fontTools and the Lora variable font). Writes site/favicon.svg;
the PNG and ICO versions were rendered from it."""
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
import sys
f = instantiateVariableFont(TTFont('/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf'), {'wght': 700})
gs, cmap = f.getGlyphSet(), f.getBestCmap()

def word(text, cx, baseline, cap, track=0.02):
    """SVG path for text, cap height `cap` px, centred on cx, baseline y (y down)."""
    capH = f['OS/2'].sCapHeight
    s = cap / capH
    # widths
    x = 0; parts = []
    for ch in text:
        g = cmap[ord(ch)]; parts.append((g, x)); x += gs[g].width + track * f['head'].unitsPerEm
    # tight bounds of the whole word
    bp = BoundsPen(gs)
    for g, ox in parts:
        gs[g].draw(TransformPen(bp, (1, 0, 0, 1, ox, 0)))
    xmin, ymin, xmax, ymax = bp.bounds
    w = (xmax - xmin) * s
    dx = cx - w / 2 - xmin * s
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip('0').rstrip('.'))
    for g, ox in parts:
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, dx + ox * s, baseline)))
    return pen.getCommands()

# Cube: square front face (for legible letters), depth d
X0, Y0, S, D = 1, 12, 51, 11
front = (X0, Y0, X0 + S, Y0 + S)
top = f"M{X0},{Y0} L{X0+S},{Y0} L{X0+S+D},{Y0-D} L{X0+D},{Y0-D} Z"
side = f"M{X0+S},{Y0} L{X0+S+D},{Y0-D} L{X0+S+D},{Y0+S-D} L{X0+S},{Y0+S} Z"
cx = X0 + S / 2
cap = 18.5
gap = 6.8
row1 = word("LT", cx, Y0 + S/2 - gap/2 + 0.2, cap)
row2 = word("DI", cx, Y0 + S/2 + gap/2 + cap - 0.2, cap)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<title>LTDI</title>
<path d="{top}" fill="#c99232"/>
<path d="{side}" fill="#0f6e60"/>
<rect x="{X0}" y="{Y0}" width="{S}" height="{S}" fill="#4a4fb8"/>
<path d="{row1}{row2}" fill="#ffffff"/>
</svg>
'''
open(__import__('pathlib').Path(__file__).resolve().parents[1] / 'site' / 'favicon.svg', 'w').write(svg)
print(len(svg))
