"""Writes self-contained copies of the listing templates to an output folder,
with fonts, CSS and screenshots inlined as data URIs, so they render from
file:// without a web server (serving the repo would also expose files such
as wix/parcelback/.env.local).

    python docs/app-market/src/inline.py <output folder>

Then open each page in a browser at its body size and screenshot it.
"""
import base64
import re
import sys
from pathlib import Path

src = Path(__file__).parent
repo = src.parents[2]
out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)


def data_uri(path: Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


fonts_css = (repo / 'site' / 'fonts' / 'fonts.css').read_text(encoding='utf-8')
fonts_css = re.sub(
    r'url\(/fonts/([^)]+)\)',
    lambda m: f"url({data_uri(repo / 'site' / 'fonts' / m.group(1), 'font/woff2')})",
    fonts_css,
)
listing_css = (src / 'listing.css').read_text(encoding='utf-8').replace("@import url('/site/fonts/fonts.css');", fonts_css)

for html_file in src.glob('*.html'):
    html = html_file.read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="listing.css">', f'<style>{listing_css}</style>')
    html = re.sub(
        r'src="/site/img/([^"]+)"',
        lambda m: f'src="{data_uri(repo / "site" / "img" / m.group(1), "image/jpeg")}"',
        html,
    )
    (out / html_file.name).write_text(html, encoding='utf-8')
print('inlined', len(list(out.glob('*.html'))), 'pages into', out)
