import { httpClient } from '@wix/essentials';
import { RETURN_REASONS } from '../../../../shared/returns';

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
    windowEndsAt: string | null;
    requests: {
      kind: 'RETURN' | 'WITHDRAWAL';
      rmaNumber: string;
      status: string;
      items: { name: string; quantity: number }[];
      rejectionReason: string | null;
    }[];
  };
  withdrawal: { available: boolean; reason: string | null; periodEndsAt: string | null };
};

type Mode = 'track' | 'withdraw';

type Customer = { orderNumber: string; email: string };

const DEFAULT_TITLE = 'Track your order';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved, please send the items back',
  REJECTED: 'Not approved',
  RECEIVED: 'Received, refund in progress',
  REFUNDING: 'Refund in progress',
  REFUNDED: 'Refunded',
};
const WITHDRAWAL_STATUS_LABELS: Record<string, string> = { ...STATUS_LABELS, REQUESTED: 'Received' };
const WITHDRAW_LABEL = 'Withdraw from contract here';

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
    return ['display-name', 'withdrawal-button'];
  }

  // EU withdrawal button, switched on in the widget settings.
  private get withdrawalEnabled() {
    return this.getAttribute('withdrawal-button') === 'true';
  }

  connectedCallback() {
    this.renderForm();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.renderForm();
  }

  private mount(...children: Node[]) {
    this.replaceChildren(el('style', { textContent: STYLES }), el('div', { className: 'abo-card' }, children));
  }

  private renderForm(message = '', mode: Mode = 'track') {
    const orderNumber = el('input', { name: 'orderNumber', placeholder: 'Order number', inputMode: 'numeric', required: true });
    const email = el('input', { name: 'email', type: 'email', placeholder: 'Email used at checkout', required: true });
    const submit = el('button', { type: 'submit', textContent: mode === 'withdraw' ? 'Continue' : 'Find my order' });
    const form = el('form', {}, [orderNumber, email, submit]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Searching…';
      void this.lookup({ orderNumber: orderNumber.value, email: email.value }, mode);
    });

    if (mode === 'withdraw') {
      const back = el('button', { type: 'button', className: 'abo-link', textContent: 'Back' });
      back.addEventListener('click', () => this.renderForm());
      form.append(back);
      this.mount(
        el('h2', { textContent: 'Withdraw from contract' }),
        el('p', { textContent: 'Enter your order number and the email you used at checkout to identify your order.' }),
        form,
      );
      return;
    }
    if (this.withdrawalEnabled) {
      const withdraw = el('button', { type: 'button', className: 'abo-link', textContent: WITHDRAW_LABEL });
      withdraw.addEventListener('click', () => this.renderForm('', 'withdraw'));
      form.append(withdraw);
    }
    this.mount(el('h2', { textContent: this.getAttribute('display-name') || DEFAULT_TITLE }), form);
  }

  private async lookup(customer: Customer, mode: Mode = 'track') {
    try {
      const { ok, body } = await post('order-lookup', customer);
      if (!ok) {
        this.renderForm(body.error ?? GENERIC_ERROR, mode);
      } else if (mode === 'withdraw' && (body as LookupResult).withdrawal.available) {
        this.renderWithdrawalForm(customer, body as LookupResult);
      } else {
        this.renderResult(customer, body as LookupResult);
      }
    } catch {
      this.renderForm(GENERIC_ERROR, mode);
    }
  }

  private renderResult(customer: Customer, order: LookupResult, notice?: Node) {
    const items = order.lineItems.map((i) => el('li', { textContent: `${i.name} × ${i.quantity}` }));

    const shipments = order.shipments.length
      ? order.shipments.map((s) => {
          const label = [s.carrier, s.trackingNumber].filter(Boolean).join(' · ') || 'Shipped';
          const li = el('li', { textContent: label });
          if (s.trackingLink?.startsWith('https://') || s.trackingLink?.startsWith('http://')) {
            li.append(' — ', el('a', { href: s.trackingLink, target: '_blank', rel: 'noopener noreferrer', textContent: 'Track shipment' }));
          }
          return li;
        })
      : [el('li', { textContent: 'Not shipped yet.' })];

    const returnsSection: Node[] = [el('h3', { textContent: 'Returns' })];
    if (notice) returnsSection.push(notice);
    if (order.returns.requests.length) {
      returnsSection.push(
        el(
          'ul',
          {},
          order.returns.requests.map((r) => {
            const labels = r.kind === 'WITHDRAWAL' ? WITHDRAWAL_STATUS_LABELS : STATUS_LABELS;
            const li = el('li', {
              textContent: `${r.kind === 'WITHDRAWAL' ? 'Withdrawal ' : ''}${r.rmaNumber}: ${r.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')} (${labels[r.status] ?? r.status})`,
            });
            if (r.rejectionReason) {
              li.append(el('br'), el('span', { className: 'abo-muted', textContent: `Reason: ${r.rejectionReason}` }));
            }
            return li;
          }),
        ),
      );
    }
    if (order.returns.eligible) {
      if (order.returns.windowEndsAt) {
        returnsSection.push(
          el('p', { className: 'abo-muted', textContent: `You can start a return until ${new Date(order.returns.windowEndsAt).toLocaleDateString()}.` }),
        );
      }
      const start = el('button', { type: 'button', textContent: 'Start a return' });
      start.addEventListener('click', () => this.renderReturnForm(customer, order));
      returnsSection.push(start);
    } else if (order.returns.reason) {
      returnsSection.push(el('p', { className: 'abo-muted', textContent: order.returns.reason }));
    }

    const withdrawalSection: Node[] = [];
    if (this.withdrawalEnabled) {
      if (order.withdrawal.available) {
        withdrawalSection.push(el('h3', { textContent: 'Withdrawal' }));
        if (order.withdrawal.periodEndsAt) {
          withdrawalSection.push(
            el('p', { className: 'abo-muted', textContent: `You can withdraw until ${new Date(order.withdrawal.periodEndsAt).toLocaleDateString()}.` }),
          );
        }
        const withdraw = el('button', { type: 'button', textContent: WITHDRAW_LABEL });
        withdraw.addEventListener('click', () => this.renderWithdrawalForm(customer, order));
        withdrawalSection.push(withdraw);
      } else if (order.withdrawal.reason && order.withdrawal.reason !== order.returns.reason) {
        withdrawalSection.push(
          el('h3', { textContent: 'Withdrawal' }),
          el('p', { className: 'abo-muted', textContent: order.withdrawal.reason }),
        );
      }
    }

    const back = el('button', { type: 'button', textContent: 'Look up another order' });
    back.addEventListener('click', () => this.renderForm());

    this.mount(
      el('h2', { textContent: `Order #${order.number}` }),
      el('p', { textContent: `Placed ${new Date(order.createdDate).toLocaleDateString()} · Status: ${order.fulfillmentStatus}` }),
      el('h3', { textContent: 'Items' }),
      el('ul', {}, items),
      el('h3', { textContent: 'Shipments' }),
      el('ul', {}, shipments),
      ...returnsSection,
      ...withdrawalSection,
      el('p'),
      back,
    );
  }

  private renderReturnForm(customer: Customer, order: LookupResult, message = '') {
    const rows = order.lineItems
      .filter((i) => i.returnableQuantity > 0)
      .map((item) => {
        const quantity = el('select', { name: `qty-${item.id}` }, [
          el('option', { value: '0', textContent: "Don't return" }),
          ...Array.from({ length: item.returnableQuantity }, (_, n) =>
            el('option', { value: String(n + 1), textContent: `Return ${n + 1}` }),
          ),
        ]);
        quantity.dataset.lineItemId = item.id;
        return { quantity, row: el('div', { className: 'abo-row' }, [el('label', { textContent: item.name }), quantity]) };
      });

    const reason = el('select', { name: 'reason', required: true }, [
      el('option', { value: '', textContent: 'Reason for return' }),
      ...RETURN_REASONS.map((r) => el('option', { value: r, textContent: r })),
    ]);
    const note = el('textarea', { name: 'note', placeholder: 'Anything else we should know? (optional)', maxLength: 1000, rows: 3 });
    const submit = el('button', { type: 'submit', textContent: 'Submit return request' });
    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    cancel.addEventListener('click', () => this.renderResult(customer, order));

    const form = el('form', {}, [...rows.map((r) => r.row), reason, note, submit, cancel]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const items = rows
        .map((r) => ({ lineItemId: r.quantity.dataset.lineItemId!, quantity: Number(r.quantity.value) }))
        .filter((i) => i.quantity > 0);
      if (!items.length) {
        this.renderReturnForm(customer, order, 'Please choose at least one item to return.');
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Submitting…';
      void this.submitReturn(customer, order, { items, reason: reason.value, note: note.value });
    });

    this.mount(el('h2', { textContent: `Return items from order #${order.number}` }), form);
  }

  private async submitReturn(
    customer: Customer,
    order: LookupResult,
    request: { items: { lineItemId: string; quantity: number }[]; reason: string; note: string },
  ) {
    try {
      const { ok, body } = await post('return-request', { ...customer, ...request });
      if (!ok) {
        this.renderReturnForm(customer, order, body.error ?? GENERIC_ERROR);
        return;
      }
      // Reload so quantities and the request list reflect the new return.
      const refreshed = await post('order-lookup', customer);
      const confirmation = el('p', {
        textContent: `Return request ${body.rmaNumber} received. The store will review it; you can check its status here any time.`,
      });
      confirmation.setAttribute('role', 'status');
      if (refreshed.ok) {
        this.renderResult(customer, refreshed.body as LookupResult, confirmation);
      } else {
        this.mount(confirmation);
      }
    } catch {
      this.renderReturnForm(customer, order, GENERIC_ERROR);
    }
  }

  private renderWithdrawalForm(customer: Customer, order: LookupResult, message = '') {
    // Everything still open is preselected; the customer can narrow it down.
    const rows = order.lineItems
      .filter((i) => i.withdrawableQuantity > 0)
      .map((item) => {
        const quantity = el('select', { name: `qty-${item.id}` }, [
          el('option', { value: '0', textContent: 'Keep' }),
          ...Array.from({ length: item.withdrawableQuantity }, (_, n) =>
            el('option', { value: String(n + 1), textContent: `Withdraw ${n + 1}` }),
          ),
        ]);
        quantity.value = String(item.withdrawableQuantity);
        quantity.dataset.lineItemId = item.id;
        return { quantity, row: el('div', { className: 'abo-row' }, [el('label', { textContent: item.name }), quantity]) };
      });

    const name = el('input', { name: 'name', placeholder: 'Your full name', value: order.customerName, required: true, maxLength: 200 });
    const note = el('textarea', { name: 'note', placeholder: 'Comment (optional)', maxLength: 1000, rows: 3 });
    const submit = el('button', { type: 'submit', textContent: 'Confirm withdrawal here' });
    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    cancel.addEventListener('click', () => this.renderResult(customer, order));

    const form = el('form', {}, [
      ...rows.map((r) => r.row),
      name,
      el('p', { className: 'abo-muted', textContent: `The confirmation will be sent to ${customer.email}.` }),
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
        this.renderWithdrawalForm(customer, order, 'Please choose at least one item.');
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Submitting…';
      void this.submitWithdrawal(customer, order, { items, name: name.value, note: note.value });
    });

    this.mount(
      el('h2', { textContent: 'Withdraw from contract' }),
      el('p', { textContent: `Order #${order.number}, placed ${new Date(order.createdDate).toLocaleDateString()}. You don’t need to give a reason.` }),
      form,
    );
  }

  private async submitWithdrawal(
    customer: Customer,
    order: LookupResult,
    request: { items: { lineItemId: string; quantity: number }[]; name: string; note: string },
  ) {
    try {
      const { ok, body } = await post('withdrawal', { ...customer, ...request });
      if (!ok) {
        this.renderWithdrawalForm(customer, order, body.error ?? GENERIC_ERROR);
        return;
      }
      const receipt = body as { reference: string; submittedAt: string; items: { name: string; quantity: number }[] };
      const submittedAt = new Date(receipt.submittedAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
      const confirmation = el('p', { textContent: `We received your withdrawal from order #${order.number} on ${submittedAt}.` });
      confirmation.setAttribute('role', 'status');
      const back = el('button', { type: 'button', textContent: 'Back to my order' });
      back.addEventListener('click', () => void this.lookup(customer));
      this.mount(
        el('h2', { textContent: 'Withdrawal received' }),
        confirmation,
        el('p', { textContent: `Reference: ${receipt.reference}` }),
        el('ul', {}, receipt.items.map((i) => el('li', { textContent: `${i.name} × ${i.quantity}` }))),
        el('p', { className: 'abo-muted', textContent: `A confirmation has been sent to ${customer.email}. The store will tell you how to send the items back.` }),
        back,
      );
    } catch {
      this.renderWithdrawalForm(customer, order, GENERIC_ERROR);
    }
  }
}

export default OrderLookup;
