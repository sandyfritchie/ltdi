"""The site icon: a square with LT / DI as a 2x2 grid in Lora Bold. L and D share a column width;
the I is centred under the stem of the T. Letters are outlines, so the icon looks the same everywhere.

Run:  python tools/make_favicon.py   (needs fontTools and the Lora variable font). Writes site/favicon.svg;
favicon.ico (16/32/48) and apple-touch-icon.png (180, square corners: iOS rounds them) were rendered from it."""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

FONT = '/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf'

def make(cap=21, gap=7, col1=22, colT=25, between=3.5, fill='#4a4fb8', ink='#ffffff', radius=4, wght=700):
    f = instantiateVariableFont(TTFont(FONT), {'wght': wght})
    gs, cmap = f.getGlyphSet(), f.getBestCmap()
    sy = cap / f['OS/2'].sCapHeight

    def bounds(ch):
        bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp); return bp.bounds

    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.2f}".rstrip('0').rstrip('.'))

    def put(ch, left=None, centre=None, width=None, sx=None, baseline=0):
        xmin, _, xmax, _ = bounds(ch)
        sx = sx or width / (xmax - xmin)
        if centre is not None:
            left = centre - (xmax - xmin) * sx / 2
        gs[cmap[ord(ch)]].draw(TransformPen(pen, (sx, 0, 0, -sy, left - xmin * sx, baseline)))
        return sx

    total = col1 + between + colT
    x1 = (64 - total) / 2
    xT = x1 + col1 + between
    top = (64 - (2 * cap + gap)) / 2
    b1, b2 = top + cap, top + 2 * cap + gap
    put('L', left=x1, width=col1, baseline=b1)
    put('D', left=x1, width=col1, baseline=b2)
    sxT = put('T', left=xT, width=colT, baseline=b1)
    # T is symmetric about its stem: the I goes under the stem's centre, as wide as the T's stretch makes it
    put('I', centre=xT + colT / 2, sx=sxT, baseline=b2)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>LTDI</title>'
            f'<rect width="64" height="64" rx="{radius}" fill="{fill}"/><path d="{pen.getCommands()}" fill="{ink}"/></svg>\n')

if __name__ == '__main__':
    from pathlib import Path
    out = sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'site' / 'favicon.svg'
    open(out, 'w').write(make())
