"""Writes the App Market listing templates (HTML) next to this file.

To render: run inline.py to get self-contained copies, open them from disk
and screenshot each page at its body size: 1600 x 1200 for listing images,
540 x 360 for the banner, 1000 x 1000 for the icon (icon.html is written by
hand).
"""
from pathlib import Path

HERE = Path(__file__).parent

LOGO = (
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="14" width="52" height="42" rx="4" fill="#e9dcc4" '
    'stroke="#1d1a16" stroke-width="4"/><path d="M6 26h52" stroke="#1d1a16" stroke-width="4"/>'
    '<path d="M26 14v12h12V14" fill="#1d1a16"/><path d="M44 44H28a6 6 0 0 1 0-12h4" fill="none" stroke="#c2372b" '
    'stroke-width="4.5" stroke-linecap="round"/><path d="M30 26.5 36 32l-6 5.5" fill="none" stroke="#c2372b" '
    'stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)
BRAND = f'<div class="brand">{LOGO} Parcelback</div>'

CHECKS = """
  ul.checks { margin: 40px 0 0; padding: 0; list-style: none; font-size: 28px; line-height: 1.4; }
  ul.checks li { padding-left: 46px; position: relative; margin-bottom: 18px; }
  ul.checks li::before { content: '✓'; position: absolute; left: 0; top: 2px; width: 30px; height: 30px;
    border: 3px solid #1d1a16; background: #fbf7ef; color: #c2372b; font: 700 22px/1 'Bricolage Grotesque';
    display: grid; place-items: center; }
"""


def page(style: str, body: str) -> str:
    return (
        '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="listing.css">'
        f'<style>{style}</style></head><body>{body}</body></html>\n'
    )


def browser(url: str, img: str, cls: str) -> str:
    return (
        f'<div class="{cls} frame browser"><div class="bar"><i></i><i></i><i></i><span>{url}</span></div>'
        f'<div class="page"><img src="{img}" alt=""></div></div>'
    )


PAGES = {
    '1-main.html': page(
        """
  .left { position: absolute; left: 90px; top: 300px; width: 760px; }
  .left h1 { font-size: 136px; margin-bottom: 34px; }
  .left .sub { font-size: 36px; }
  .label { position: absolute; right: 110px; top: 250px; width: 600px; background: #fbf7ef; border: 4px solid #1d1a16;
    border-radius: 10px; padding: 34px 36px 26px; transform: rotate(3deg); box-shadow: 0 30px 60px -26px rgb(60 40 10 / 0.5);
    font: 500 26px 'IBM Plex Mono', monospace; }
  .label .big { font: 800 52px 'Bricolage Grotesque'; letter-spacing: -0.02em; padding-bottom: 16px; border-bottom: 4px solid #1d1a16; }
  .label .row { display: flex; justify-content: space-between; padding: 16px 0; border-bottom: 2.5px dashed rgb(29 26 22 / 0.45); }
  .label .row span:first-child { font-size: 19px; letter-spacing: 0.12em; color: #4a443b; text-transform: uppercase; }
  .label .bars { height: 86px; margin-top: 18px; background: repeating-linear-gradient(90deg, #1d1a16 0 3px, transparent 3px 6px,
    #1d1a16 6px 8px, transparent 8px 12px, #1d1a16 12px 17px, transparent 17px 19px, #1d1a16 19px 21px, transparent 21px 25px); }
  .label .ref { text-align: center; letter-spacing: 0.4em; font-size: 20px; margin-top: 8px; }
  .label::before { content: ''; position: absolute; top: -22px; left: 50%; width: 180px; height: 42px;
    transform: translateX(-50%) rotate(-3deg); background: rgb(255 248 225 / 0.75); border: 1px solid rgb(0 0 0 / 0.08); }
  .stamp { position: absolute; right: 60px; top: 800px; width: 220px; height: 220px; border-radius: 50%;
    border: 6px solid #c2372b; background: #fbf7ef; color: #c2372b; transform: rotate(-14deg); display: grid;
    place-items: center; text-align: center; font: 600 24px/1.25 'IBM Plex Mono', monospace; letter-spacing: 0.06em;
    text-transform: uppercase; }
  .stamp::before { content: ''; position: absolute; inset: 9px; border: 2.5px solid #c2372b; border-radius: 50%; }
  .langs { margin-top: 56px; display: flex; gap: 14px; flex-wrap: wrap; }
  .langs span { font: 600 26px 'IBM Plex Mono', monospace; border: 3px solid #1d1a16; padding: 6px 12px; background: #fbf7ef; }
""",
        """
  <div class="left">
    <div class="kicker">Returns &amp; order tracking</div>
    <h1>Parcel<em>back</em></h1>
    <p class="sub">Customers track orders and start returns themselves. You approve and refund in one click.</p>
    <div class="langs"><span>EN</span><span>DE</span><span>FR</span><span>ES</span><span>IT</span><span>NL</span><span>PT</span></div>
  </div>
  <div class="label">
    <div class="big">RETURN</div>
    <div class="row"><span>Order</span><span>#10042</span></div>
    <div class="row"><span>Item</span><span>Linen shirt × 1</span></div>
    <div class="row"><span>Reason</span><span>Wrong size or fit</span></div>
    <div class="row"><span>Status</span><span>Approved</span></div>
    <div class="bars"></div>
    <div class="ref">R10042-1</div>
  </div>
  <div class="stamp">Refunded<br>in one<br>click</div>
""",
    ),
    '2-customer.html': page(
        """
  .left { position: absolute; left: 90px; top: 230px; width: 640px; }
  .right { position: absolute; right: 90px; top: 120px; width: 640px; }
"""
        + CHECKS,
        f"""
  <div class="left">
    <div class="kicker">For your customers</div>
    <h1>Track the order. Start a return. <em>No account.</em></h1>
    <ul class="checks">
      <li>Order number and email are enough</li>
      <li>Shipments with carrier tracking links</li>
      <li>Returns within your window and reasons</li>
    </ul>
  </div>
  {browser('yourstore.com/track-order', '/site/img/shot-order-page.jpg', 'right')}
  {BRAND}
""",
    ),
    '3-queue.html': page(
        """
  .top { position: absolute; left: 90px; top: 80px; width: 1420px; }
  .top h1 { font-size: 68px; margin-bottom: 16px; }
  .shot { position: absolute; left: 90px; right: 90px; top: 370px; }
""",
        """
  <div class="top">
    <div class="kicker">In your dashboard</div>
    <h1>Every return and withdrawal in <em>one queue</em></h1>
    <p class="sub">Approve, reject with a reason the customer sees, mark as received, and refund in one click, with restock.</p>
  </div>
  <div class="shot frame"><img src="/site/img/shot-dashboard-returns.jpg" alt=""></div>
""",
    ),
    '4-withdrawal.html': page(
        """
  .left { position: absolute; left: 90px; top: 110px; width: 680px; }
  .right { position: absolute; right: 90px; top: 110px; width: 600px; }
  .labels { margin-top: 36px; background: #fbf7ef; border: 3px solid #1d1a16; border-radius: 10px; padding: 14px 24px; }
  .labels div { display: flex; justify-content: space-between; gap: 20px; padding: 11px 0;
    border-bottom: 2px dashed rgb(29 26 22 / 0.35); font: 500 23px 'IBM Plex Mono', monospace; }
  .labels div:last-child { border-bottom: 0; }
  .labels b { color: #c2372b; font-weight: 600; }
  .labels span { text-decoration: underline; text-underline-offset: 4px; }
""",
        f"""
  <div class="left">
    <div class="kicker">Selling in the EU</div>
    <h1>The withdrawal button, <em>in 7 languages</em></h1>
    <p class="sub">No reason asked. Timestamped confirmation on screen and by email. Withdrawals land in your queue with a refund due date.</p>
    <div class="labels">
      <div><b>EN</b><span>Withdraw from contract here</span></div>
      <div><b>DE</b><span>Vertrag hier widerrufen</span></div>
      <div><b>FR</b><span>Se rétracter du contrat ici</span></div>
      <div><b>ES</b><span>Desistir del contrato aquí</span></div>
    </div>
  </div>
  {browser('yourstore.de', '/site/img/shot-withdrawal-de.jpg', 'right')}
  {BRAND}
""",
    ),
    '5-settings.html': page(
        """
  .left { position: absolute; left: 80px; top: 300px; width: 450px; }
  .left h1 { font-size: 66px; }
  .right { position: absolute; right: 60px; top: 190px; width: 1000px; }
"""
        + CHECKS,
        f"""
  <div class="left">
    <div class="kicker">Your rules</div>
    <h1>Your return policy, <em>applied for you</em></h1>
    <ul class="checks">
      <li>Return window in days</li>
      <li>Your own return reasons</li>
      <li>Final-sale products</li>
      <li>Returns on or off</li>
    </ul>
  </div>
  <div class="right frame"><img src="/site/img/shot-dashboard-settings.jpg" alt=""></div>
  {BRAND}
""",
    ),
    # Promotional banner: Wix asks for no text and no logo, so it's illustration only.
    'banner.html': page(
        """
  body { width: 540px; height: 360px; }
  svg { position: absolute; inset: 0; }
""",
        """
  <svg width="540" height="360" viewBox="0 0 540 360">
    <g transform="rotate(-6 200 190)">
      <rect x="70" y="95" width="260" height="200" rx="18" fill="#fbf7ef" stroke="#1d1a16" stroke-width="10"/>
      <path d="M70 148h260" stroke="#1d1a16" stroke-width="10"/>
      <path d="M170 95v53h60V95" fill="#1d1a16"/>
      <path d="M262 250H168a34 34 0 0 1 0-68h26" fill="none" stroke="#c2372b" stroke-width="16" stroke-linecap="round"/>
      <path d="M182 162l26 20-26 20" fill="none" stroke="#c2372b" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <g transform="rotate(4 420 120)">
      <rect x="350" y="62" width="150" height="110" rx="8" fill="#fbf7ef" stroke="#1d1a16" stroke-width="5"/>
      <rect x="366" y="80" width="118" height="54" fill="url(#bars)"/>
      <path d="M366 150h118" stroke="#1d1a16" stroke-width="4" stroke-dasharray="6 6"/>
    </g>
    <g transform="rotate(-14 430 265)">
      <circle cx="430" cy="265" r="58" fill="#fbf7ef" stroke="#c2372b" stroke-width="7"/>
      <circle cx="430" cy="265" r="47" fill="none" stroke="#c2372b" stroke-width="3"/>
      <path d="M404 266l18 18 34-36" fill="none" stroke="#c2372b" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <defs>
      <pattern id="bars" width="16" height="54" patternUnits="userSpaceOnUse">
        <rect x="0" width="3" height="54" fill="#1d1a16"/><rect x="5" width="1.5" height="54" fill="#1d1a16"/>
        <rect x="8.5" width="4" height="54" fill="#1d1a16"/><rect x="14" width="1" height="54" fill="#1d1a16"/>
      </pattern>
    </defs>
  </svg>
""",
    ),
}

for name, html in PAGES.items():
    (HERE / name).write_text(html, encoding='utf-8', newline='\n')
print('wrote', ', '.join(PAGES))
