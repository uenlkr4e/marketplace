import { httpClient } from '@wix/essentials';
import { resolveLanguage, translator } from './i18n';

type Shipment = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingLink: string | null;
};

type LineItem = { id: string; name: string; quantity: number; returnableQuantity: number; withdrawableQuantity: number };

type LookupResult = {
  number: string;
  createdDate: string;
  fulfillmentStatus: string;
  customerName: string;
  lineItems: LineItem[];
  shipments: Shipment[];
  returns: {
    eligible: boolean;
    reason: string | null;
    reasonCode: string | null;
    windowEndsAt: string | null;
    reasons: string[]; // the store's reasons (Settings page)
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

type Customer = { orderNumber: string; email: string };

const STYLES = `
  order-lookup { display: block; font: inherit; color: inherit; }
  order-lookup .abo-card { padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  order-lookup form { display: grid; gap: 8px; }
  order-lookup input, order-lookup button, order-lookup select, order-lookup textarea { font: inherit; padding: 8px 10px; }
  order-lookup button { cursor: pointer; }
  order-lookup .abo-error { color: #b00020; }
  order-lookup .abo-muted { opacity: 0.75; }
  order-lookup .abo-row { display: flex; gap: 8px; align-items: center; }
  order-lookup .abo-row label { flex: 1; }
  order-lookup .abo-link { background: none; border: none; padding: 0; text-decoration: underline; justify-self: start; }
  order-lookup ul { padding-left: 18px; }
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

  connectedCallback() {
    this.renderForm();
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

    if (mode === 'withdraw') {
      const back = el('button', { type: 'button', className: 'abo-link', textContent: t('back') });
      back.addEventListener('click', () => this.renderForm());
      form.append(back);
      this.mount(el('h2', { textContent: t('withdrawTitle') }), el('p', { textContent: t('withdrawIntro') }), form);
      return;
    }
    if (this.withdrawalEnabled) {
      const withdraw = el('button', { type: 'button', className: 'abo-link', textContent: t('withdrawLink') });
      withdraw.addEventListener('click', () => this.renderForm('', 'withdraw'));
      form.append(withdraw);
    }
    this.mount(el('h2', { textContent: this.getAttribute('display-name') || t('title') }), form);
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
    const items = order.lineItems.map((i) => el('li', { textContent: `${i.name} × ${i.quantity}` }));

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

    const back = el('button', { type: 'button', textContent: t('lookupAnother') });
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
    const cancel = el('button', { type: 'button', textContent: t('cancel') });
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
    const cancel = el('button', { type: 'button', textContent: t('cancel') });
    cancel.addEventListener('click', () => this.renderResult(customer, order));

    const form = el('form', {}, [
      ...rows.map((r) => r.row),
      name,
      el('p', { className: 'abo-muted', textContent: t('confirmationTo', { email: customer.email }) }),
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
      const back = el('button', { type: 'button', textContent: t('backToOrder') });
      back.addEventListener('click', () => void this.lookup(customer));
      this.mount(
        el('h2', { textContent: t('withdrawalReceivedTitle') }),
        confirmation,
        el('p', { textContent: t('reference', { reference: receipt.reference }) }),
        el('ul', {}, receipt.items.map((i) => el('li', { textContent: `${i.name} × ${i.quantity}` }))),
        el('p', { className: 'abo-muted', textContent: t('withdrawalNext', { email: customer.email }) }),
        back,
      );
    } catch {
      this.renderWithdrawalForm(customer, order, t('genericError'));
    }
  }
}

export default OrderLookup;
