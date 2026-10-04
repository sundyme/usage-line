"""Static, subsetted copies of the films' fonts, holding only the glyphs their sources use
(film/*.mjs and trailer/src/*.js). Written to film/fonts and copied to trailer/fonts.

    python3 fonts.py <dir with NotoSansSC[wght].ttf, JetBrainsMono[wght].ttf, InstrumentSerif-Italic.ttf>
"""
import glob, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

src, out = sys.argv[1], os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
os.makedirs(out, exist_ok=True)
used = set(chr(c) for c in range(0x20, 0x7f))
here = os.path.dirname(os.path.abspath(__file__))
for f in glob.glob(os.path.join(here, '*.mjs')) + glob.glob(os.path.join(here, '..', 'trailer', 'src', '*.js')):
    used |= set(open(f, encoding='utf-8').read())
text = ''.join(sorted(c for c in used if c.isprintable() or c == ' '))

FONTS = [
    ('NotoSansSC[wght].ttf', {'wght': 300}, 'SC-Light.ttf'),
    ('NotoSansSC[wght].ttf', {'wght': 400}, 'SC-Regular.ttf'),
    ('NotoSansSC[wght].ttf', {'wght': 500}, 'SC-Medium.ttf'),
    ('NotoSansSC[wght].ttf', {'wght': 700}, 'SC-Bold.ttf'),
    ('NotoSansSC[wght].ttf', {'wght': 900}, 'SC-Black.ttf'),
    ('JetBrainsMono[wght].ttf', {'wght': 400}, 'Mono-Regular.ttf'),
    ('JetBrainsMono[wght].ttf', {'wght': 600}, 'Mono-SemiBold.ttf'),
    ('InstrumentSerif-Italic.ttf', None, 'Serif-Italic.ttf'),
]
cache = {}
for name, axes, dest in FONTS:
    font = TTFont(os.path.join(src, name))
    if axes:
        font = instantiateVariableFont(font, axes)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    font.save(os.path.join(out, dest))
    print(dest, os.path.getsize(os.path.join(out, dest)) // 1024, 'KB')
import shutil; shutil.copytree(out, os.path.join(here, '..', 'trailer', 'fonts'), dirs_exist_ok=True)
