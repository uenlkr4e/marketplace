import { httpClient } from '@wix/essentials';
import { resolveLanguage, translator } from './i18n';

type Shipment = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingLink: string | null;
};

type LineItem = {
  id: string;
  name: string;
  quantity: number;
  returnableQuantity: number;
  withdrawableQuantity: number;
  finalSale: boolean;
};

type LookupResult = {
  number: string;
  createdDate: string;
  fulfillmentStatus: string;
  customerName: string;
  email: string; // where confirmations go: the entered email, or the order's for members
  lineItems: LineItem[];
  shipments: Shipment[];
  returns: {
    eligible: boolean;
    reason: string | null;
    reasonCode: string | null;
    windowEndsAt: string | null;
    reasons: string[]; // the store's reasons (Settings page)
    instructions?: string; // how to send items back, shown once a return is approved
    requests: {
      kind: 'RETURN' | 'WITHDRAWAL';
      rmaNumber: string;
      status: string;
      items: { name: string; quantity: number }[];
      rejectionReason: string | null;
    }[];
  };
  withdrawal: { available: boolean; reason: string | null; reasonCode: string | null; periodEndsAt: string | null };
};

type Mode = 'track' | 'withdraw';

// A logged-in member's own orders are looked up without an email (empty string).
type Customer = { orderNumber: string; email: string };

type MemberOrder = {
  number: string;
  createdDate: string;
  fulfillmentStatus: string;
  itemCount: number;
  total: string | null;
};

// Explicit defaults: Wix themes reset buttons and font sizes, which left the
// widget's buttons looking like plain text on a live site.
const STYLES = `
  order-lookup { display: block; color: inherit; font-family: inherit; font-size: 16px; line-height: 1.5; }
  order-lookup .abo-card { box-sizing: border-box; padding: 20px 22px; border: 1px solid #d9d9d9; border-radius: 10px; background: #fff; }
  order-lookup .abo-card h2 { font-size: 22px; line-height: 1.25; font-weight: 700; margin: 0 0 12px; }
  order-lookup .abo-card h3 { font-size: 16px; font-weight: 700; margin: 18px 0 6px; }
  order-lookup .abo-card p { margin: 6px 0; }
  order-lookup .abo-card ul { margin: 4px 0 8px; padding-left: 20px; }
  order-lookup .abo-card a { color: inherit; text-decoration: underline; }
  order-lookup form { display: grid; gap: 10px; }
  order-lookup .abo-card input, order-lookup .abo-card select, order-lookup .abo-card textarea {
    box-sizing: border-box; width: 100%; font: inherit; font-size: 15px; color: #1f1f1f;
    padding: 10px 12px; border: 1px solid #b9b9b9; border-radius: 6px; background: #fff;
  }
  order-lookup .abo-row select { width: auto; min-width: 140px; }
  order-lookup .abo-card input:focus, order-lookup .abo-card select:focus, order-lookup .abo-card textarea:focus {
    outline: 2px solid #1f1f1f; outline-offset: 1px;
  }
  order-lookup .abo-card button {
    box-sizing: border-box; display: inline-block; justify-self: start; margin: 4px 0;
    font: inherit; font-size: 15px; font-weight: 600; line-height: 1.2; text-align: center;
    padding: 11px 18px; border-radius: 6px; cursor: pointer;
    border: 1px solid #1f1f1f; background: #1f1f1f; color: #fff;
  }
  order-lookup .abo-card button:hover { background: #3a3a3a; border-color: #3a3a3a; }
  order-lookup .abo-card button:disabled { opacity: 0.6; cursor: default; }
  order-lookup .abo-card button.abo-secondary { background: transparent; color: #1f1f1f; }
  order-lookup .abo-card button.abo-secondary:hover { background: #f2f2f2; }
  order-lookup .abo-card button.abo-link {
    background: none; border: none; padding: 0; margin: 2px 0; font-weight: 400; color: inherit; text-decoration: underline;
  }
  order-lookup .abo-error { color: #b00020; }
  order-lookup .abo-muted { opacity: 0.75; }
  order-lookup .abo-row { display: flex; gap: 10px; align-items: center; }
  order-lookup .abo-row label { flex: 1; }
  order-lookup .abo-instructions { margin: 8px 0 12px; padding: 12px 14px; border-radius: 6px; background: #f4f4f4; }
  order-lookup .abo-instructions p { white-space: pre-line; margin: 4px 0 0; }
  order-lookup .abo-orders { display: grid; gap: 8px; margin: 4px 0 16px; }
  order-lookup .abo-card button.abo-order {
    width: 100%; margin: 0; text-align: left; font-weight: 400; line-height: 1.4;
    background: transparent; color: #1f1f1f; border-color: #d9d9d9;
  }
  order-lookup .abo-card button.abo-order:hover { background: #f2f2f2; border-color: #b9b9b9; }
  order-lookup .abo-order strong { font-weight: 700; }
`;

// Builds an element; all text goes through textContent, never parsed as HTML.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function errorText(message: string) {
  const error = el('p', { className: 'abo-error', textContent: message });
  error.setAttribute('role', 'alert');
  return error;
}

async function post(path: string, payload: unknown) {
  const response = await httpClient.fetchWithAuth(`${new URL(import.meta.url).origin}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, body: await response.json() };
}

class OrderLookup extends HTMLElement {
  static get observedAttributes() {
    return ['display-name', 'withdrawal-button', 'language'];
  }

  // Widget setting "language" ("auto" or a code); auto follows the site's language.
  private get locale() {
    const setting = this.getAttribute('language');
    return resolveLanguage(setting && setting !== 'auto' ? setting : null, document.documentElement.lang, navigator.language);
  }

  private get t() {
    return translator(this.locale);
  }

  // EU withdrawal button, switched on in the widget settings.
  private get withdrawalEnabled() {
    return this.getAttribute('withdrawal-button') === 'true';
  }

  private date(iso: string) {
    return new Date(iso).toLocaleDateString(this.locale);
  }

  /** Server messages come with a code; translate it, or show the server's English text. */
  private message(code: string | null | undefined, fallback: string | null | undefined) {
    const key = `error.${code}`;
    return code && this.t.has(key) ? this.t(key) : (fallback ?? this.t('genericError'));
  }

  // Orders of the logged-in member, loaded once per page view; empty for visitors.
  private memberOrders: MemberOrder[] = [];
  private memberOrdersSlot: HTMLElement | null = null;

  connectedCallback() {
    this.renderForm();
    void this.loadMemberOrders();
  }

  private async loadMemberOrders() {
    try {
      const { ok, body } = await post('my-orders', {});
      if (!ok || !body.orders?.length) return;
      this.memberOrders = body.orders as MemberOrder[];
      // Fill the list in place if the form is still showing, so nothing the customer typed is lost.
      if (this.memberOrdersSlot?.isConnected) this.fillMemberOrders(this.memberOrdersSlot);
    } catch {
      // The form still works without the list.
    }
  }

  private fillMemberOrders(slot: HTMLElement, mode: Mode = 'track') {
    const t = this.t;
    if (!this.memberOrders.length) return;
    const buttons = this.memberOrders.map((order) => {
      const fulfillmentKey = `fulfillment.${order.fulfillmentStatus}`;
      const status = t.has(fulfillmentKey) ? t(fulfillmentKey) : order.fulfillmentStatus;
      const details = [this.date(order.createdDate), status, order.total].filter(Boolean).join(' · ');
      const button = el('button', { type: 'button', className: 'abo-order' }, [
        el('strong', { textContent: t('orderHeading', { number: order.number }) }),
        el('br'),
        el('span', { className: 'abo-muted', textContent: details }),
      ]);
      button.addEventListener('click', () => {
        button.disabled = true;
        void this.lookup({ orderNumber: String(order.number), email: '' }, mode);
      });
      return button;
    });
    slot.replaceChildren(
      el('h3', { textContent: t('yourOrders') }),
      el('div', { className: 'abo-orders' }, buttons),
      el('p', { className: 'abo-muted', textContent: t('otherOrder') }),
    );
  }

  attributeChangedCallback() {
    if (this.isConnected) this.renderForm();
  }

  private mount(...children: Node[]) {
    this.lang = this.locale; // screen readers and hyphenation
    this.replaceChildren(el('style', { textContent: STYLES }), el('div', { className: 'abo-card' }, children));
  }

  private renderForm(message = '', mode: Mode = 'track') {
    const t = this.t;
    const orderNumber = el('input', { name: 'orderNumber', placeholder: t('orderNumber'), inputMode: 'numeric', required: true });
    const email = el('input', { name: 'email', type: 'email', placeholder: t('email'), required: true });
    const submit = el('button', { type: 'submit', textContent: mode === 'withdraw' ? t('continue') : t('findOrder') });
    const form = el('form', {}, [orderNumber, email, submit]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = t('searching');
      void this.lookup({ orderNumber: orderNumber.value, email: email.value }, mode);
    });

    const memberOrders = el('div');
    this.memberOrdersSlot = memberOrders;
    this.fillMemberOrders(memberOrders, mode);

    if (mode === 'withdraw') {
      const back = el('button', { type: 'button', className: 'abo-link', textContent: t('back') });
      back.addEventListener('click', () => this.renderForm());
      form.append(back);
      this.mount(el('h2', { textContent: t('withdrawTitle') }), el('p', { textContent: t('withdrawIntro') }), memberOrders, form);
      return;
    }
    if (this.withdrawalEnabled) {
      const withdraw = el('button', { type: 'button', className: 'abo-link', textContent: t('withdrawLink') });
      withdraw.addEventListener('click', () => this.renderForm('', 'withdraw'));
      form.append(withdraw);
    }
    this.mount(el('h2', { textContent: this.getAttribute('display-name') || t('title') }), memberOrders, form);
  }

  private async lookup(customer: Customer, mode: Mode = 'track') {
    try {
      const { ok, body } = await post('order-lookup', customer);
      if (!ok) {
        this.renderForm(this.message(body.code, body.error), mode);
      } else if (mode === 'withdraw' && (body as LookupResult).withdrawal.available) {
        this.renderWithdrawalForm(customer, body as LookupResult);
      } else {
        this.renderResult(customer, body as LookupResult);
      }
    } catch {
      this.renderForm(this.t('genericError'), mode);
    }
  }

  private renderResult(customer: Customer, order: LookupResult, notice?: Node) {
    const t = this.t;
    const items = order.lineItems.map((i) =>
      el('li', { textContent: `${i.name} × ${i.quantity}${i.finalSale ? ` · ${t('finalSale')}` : ''}` }),
    );

    const shipments = order.shipments.length
      ? order.shipments.map((s) => {
          const label = [s.carrier, s.trackingNumber].filter(Boolean).join(' · ') || t('shipped');
          const li = el('li', { textContent: label });
          if (s.trackingLink?.startsWith('https://') || s.trackingLink?.startsWith('http://')) {
            li.append(' — ', el('a', { href: s.trackingLink, target: '_blank', rel: 'noopener noreferrer', textContent: t('trackShipment') }));
          }
          return li;
        })
      : [el('li', { textContent: t('notShipped') })];

    const returnsSection: Node[] = [el('h3', { textContent: t('returns') })];
    if (notice) returnsSection.push(notice);
    if (order.returns.requests.length) {
      returnsSection.push(
        el(
          'ul',
          {},
          order.returns.requests.map((r) => {
            const withdrawal = r.kind === 'WITHDRAWAL';
            const status =
              withdrawal && r.status === 'REQUESTED' ? t('withdrawalStatusReceived') : t(`status.${r.status}`);
            const reference = withdrawal ? t('withdrawalPrefix', { reference: r.rmaNumber }) : r.rmaNumber;
            const li = el('li', {
              textContent: `${reference}: ${r.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')} (${status})`,
            });
            if (r.rejectionReason) {
              li.append(el('br'), el('span', { className: 'abo-muted', textContent: t('rejectionReason', { reason: r.rejectionReason }) }));
            }
            return li;
          }),
        ),
      );
    }
    // The store's return instructions, while a return is approved and waiting for the parcel.
    const awaitingParcel = order.returns.requests.some((r) => r.kind === 'RETURN' && r.status === 'APPROVED');
    if (awaitingParcel && order.returns.instructions) {
      returnsSection.push(
        el('div', { className: 'abo-instructions' }, [
          el('strong', { textContent: t('returnInstructions') }),
          el('p', { textContent: order.returns.instructions }),
        ]),
      );
    }
    const returnsReason = order.returns.reason ? this.message(order.returns.reasonCode, order.returns.reason) : null;
    if (order.returns.eligible) {
      if (order.returns.windowEndsAt) {
        returnsSection.push(
          el('p', { className: 'abo-muted', textContent: t('returnUntil', { date: this.date(order.returns.windowEndsAt) }) }),
        );
      }
      const start = el('button', { type: 'button', textContent: t('startReturn') });
      start.addEventListener('click', () => this.renderReturnForm(customer, order));
      returnsSection.push(start);
    } else if (returnsReason) {
      returnsSection.push(el('p', { className: 'abo-muted', textContent: returnsReason }));
    }

    const withdrawalSection: Node[] = [];
    if (this.withdrawalEnabled) {
      const withdrawalReason = order.withdrawal.reason ? this.message(order.withdrawal.reasonCode, order.withdrawal.reason) : null;
      if (order.withdrawal.available) {
        withdrawalSection.push(el('h3', { textContent: t('withdrawal') }));
        if (order.withdrawal.periodEndsAt) {
          withdrawalSection.push(
            el('p', { className: 'abo-muted', textContent: t('withdrawUntil', { date: this.date(order.withdrawal.periodEndsAt) }) }),
          );
        }
        const withdraw = el('button', { type: 'button', textContent: t('withdrawLink') });
        withdraw.addEventListener('click', () => this.renderWithdrawalForm(customer, order));
        withdrawalSection.push(withdraw);
      } else if (withdrawalReason && withdrawalReason !== returnsReason) {
        withdrawalSection.push(
          el('h3', { textContent: t('withdrawal') }),
          el('p', { className: 'abo-muted', textContent: withdrawalReason }),
        );
      }
    }

    const back = el('button', { type: 'button', className: 'abo-secondary', textContent: t('lookupAnother') });
    back.addEventListener('click', () => this.renderForm());

    const fulfillmentKey = `fulfillment.${order.fulfillmentStatus}`;
    const status = t.has(fulfillmentKey) ? t(fulfillmentKey) : order.fulfillmentStatus;
    this.mount(
      el('h2', { textContent: t('orderHeading', { number: order.number }) }),
      el('p', { textContent: t('placedStatus', { date: this.date(order.createdDate), status }) }),
      el('h3', { textContent: t('items') }),
      el('ul', {}, items),
      el('h3', { textContent: t('shipments') }),
      el('ul', {}, shipments),
      ...returnsSection,
      ...withdrawalSection,
      el('p'),
      back,
    );
  }

  private renderReturnForm(customer: Customer, order: LookupResult, message = '') {
    const t = this.t;
    const rows = order.lineItems
      .filter((i) => i.returnableQuantity > 0)
      .map((item) => {
        const quantity = el('select', { name: `qty-${item.id}` }, [
          el('option', { value: '0', textContent: t('dontReturn') }),
          ...Array.from({ length: item.returnableQuantity }, (_, n) =>
            el('option', { value: String(n + 1), textContent: t('returnQty', { n: n + 1 }) }),
          ),
        ]);
        quantity.dataset.lineItemId = item.id;
        return { quantity, row: el('div', { className: 'abo-row' }, [el('label', { textContent: item.name }), quantity]) };
      });

    // Option values stay as saved (built-in ones in English): they're stored and shown to the merchant.
    // Built-in reasons are translated; the store's custom reasons are shown as typed.
    const reason = el('select', { name: 'reason', required: true }, [
      el('option', { value: '', textContent: t('reasonPlaceholder') }),
      ...order.returns.reasons.map((r) =>
        el('option', { value: r, textContent: t.has(`reason.${r}`) ? t(`reason.${r}`) : r }),
      ),
    ]);
    const note = el('textarea', { name: 'note', placeholder: t('notePlaceholder'), maxLength: 1000, rows: 3 });
    const submit = el('button', { type: 'submit', textContent: t('submitReturn') });
    const cancel = el('button', { type: 'button', className: 'abo-secondary', textContent: t('cancel') });
    cancel.addEventListener('click', () => this.renderResult(customer, order));

    const form = el('form', {}, [...rows.map((r) => r.row), reason, note, submit, cancel]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const items = rows
        .map((r) => ({ lineItemId: r.quantity.dataset.lineItemId!, quantity: Number(r.quantity.value) }))
        .filter((i) => i.quantity > 0);
      if (!items.length) {
        this.renderReturnForm(customer, order, t('chooseItemReturn'));
        return;
      }
      submit.disabled = true;
      submit.textContent = t('submitting');
      void this.submitReturn(customer, order, { items, reason: reason.value, note: note.value });
    });

    this.mount(el('h2', { textContent: t('returnFormTitle', { number: order.number }) }), form);
  }

  private async submitReturn(
    customer: Customer,
    order: LookupResult,
    request: { items: { lineItemId: string; quantity: number }[]; reason: string; note: string },
  ) {
    try {
      const { ok, body } = await post('return-request', { ...customer, ...request });
      if (!ok) {
        this.renderReturnForm(customer, order, this.message(body.code, body.error));
        return;
      }
      // Reload so quantities and the request list reflect the new return.
      const refreshed = await post('order-lookup', customer);
      const confirmation = el('p', { textContent: this.t('returnReceived', { reference: body.rmaNumber }) });
      confirmation.setAttribute('role', 'status');
      if (refreshed.ok) {
        this.renderResult(customer, refreshed.body as LookupResult, confirmation);
      } else {
        this.mount(confirmation);
      }
    } catch {
      this.renderReturnForm(customer, order, this.t('genericError'));
    }
  }

  private renderWithdrawalForm(customer: Customer, order: LookupResult, message = '') {
    const t = this.t;
    // Everything still open is preselected; the customer can narrow it down.
    const rows = order.lineItems
      .filter((i) => i.withdrawableQuantity > 0)
      .map((item) => {
        const quantity = el('select', { name: `qty-${item.id}` }, [
          el('option', { value: '0', textContent: t('keep') }),
          ...Array.from({ length: item.withdrawableQuantity }, (_, n) =>
            el('option', { value: String(n + 1), textContent: t('withdrawQty', { n: n + 1 }) }),
          ),
        ]);
        quantity.value = String(item.withdrawableQuantity);
        quantity.dataset.lineItemId = item.id;
        return { quantity, row: el('div', { className: 'abo-row' }, [el('label', { textContent: item.name }), quantity]) };
      });

    const name = el('input', { name: 'name', placeholder: t('namePlaceholder'), value: order.customerName, required: true, maxLength: 200 });
    const note = el('textarea', { name: 'note', placeholder: t('commentPlaceholder'), maxLength: 1000, rows: 3 });
    const submit = el('button', { type: 'submit', textContent: t('confirmWithdrawal') });
    const cancel = el('button', { type: 'button', className: 'abo-secondary', textContent: t('cancel') });
    cancel.addEventListener('click', () => this.renderResult(customer, order));

    const form = el('form', {}, [
      ...rows.map((r) => r.row),
      name,
      el('p', { className: 'abo-muted', textContent: t('confirmationTo', { email: order.email }) }),
      note,
      submit,
      cancel,
    ]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const items = rows
        .map((r) => ({ lineItemId: r.quantity.dataset.lineItemId!, quantity: Number(r.quantity.value) }))
        .filter((i) => i.quantity > 0);
      if (!items.length) {
        this.renderWithdrawalForm(customer, order, t('chooseItem'));
        return;
      }
      submit.disabled = true;
      submit.textContent = t('submitting');
      void this.submitWithdrawal(customer, order, { items, name: name.value, note: note.value });
    });

    this.mount(
      el('h2', { textContent: t('withdrawTitle') }),
      el('p', { textContent: t('withdrawFormIntro', { number: order.number, date: this.date(order.createdDate) }) }),
      form,
    );
  }

  private async submitWithdrawal(
    customer: Customer,
    order: LookupResult,
    request: { items: { lineItemId: string; quantity: number }[]; name: string; note: string },
  ) {
    const t = this.t;
    try {
      const { ok, body } = await post('withdrawal', { ...customer, ...request });
      if (!ok) {
        this.renderWithdrawalForm(customer, order, this.message(body.code, body.error));
        return;
      }
      const receipt = body as { reference: string; submittedAt: string; items: { name: string; quantity: number }[] };
      const submittedAt = new Date(receipt.submittedAt).toLocaleString(this.locale, { dateStyle: 'long', timeStyle: 'short' });
      const confirmation = el('p', { textContent: t('withdrawalReceivedText', { number: order.number, date: submittedAt }) });
      confirmation.setAttribute('role', 'status');
      const back = el('button', { type: 'button', className: 'abo-secondary', textContent: t('backToOrder') });
      back.addEventListener('click', () => void this.lookup(customer));
      this.mount(
        el('h2', { textContent: t('withdrawalReceivedTitle') }),
        confirmation,
        el('p', { textContent: t('reference', { reference: receipt.reference }) }),
        el('ul', {}, receipt.items.map((i) => el('li', { textContent: `${i.name} × ${i.quantity}` }))),
        el('p', { className: 'abo-muted', textContent: t('withdrawalNext', { email: order.email }) }),
        back,
      );
    } catch {
      this.renderWithdrawalForm(customer, order, t('genericError'));
    }
  }
}

export default OrderLookup;
