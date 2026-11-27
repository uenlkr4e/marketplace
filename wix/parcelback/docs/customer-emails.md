# Customer emails: wording and remaining setup

Emails go through **Wix Automations**. The app reports `return_requested`, `return_approved`, `return_rejected` and `withdrawal_received` (see `src/backend/notify.ts`). Each automation is "Parcelback trigger → Send an email", and Wix sends it to the trigger's contact (`contact_id`).

Variables below refer to the trigger fields. In Wix's email editor, insert them with **+ Add variable → Parcelback**.

## 1. Return requested

- **Subject:** We've received your return request ({Return number})
- **Body:**

  > Hi {Contact first name},
  >
  > Thanks for letting us know. We've received your return request **{Return number}** for order **#{Order number}**.
  >
  > **Items:** {Returned items}
  > **Reason:** {Return reason}
  >
  > We'll review it shortly and email you as soon as it's approved or declined. Please don't send anything back until you hear from us.
  >
  > Thanks,
  > {Site name}

## 2. Return approved

- **Subject:** Your return {Return number} is approved
- **Body:**

  > Hi {Contact first name},
  >
  > Good news: your return **{Return number}** for order **#{Order number}** has been approved.
  >
  > **Items to send back:** {Returned items}
  >
  > {Note from the store}
  >
  > Once we receive the items, we'll process your refund and you'll get a confirmation email.
  >
  > Thanks,
  > {Site name}

## 3. Return rejected

- **Subject:** Update on your return request {Return number}
- **Body:**

  > Hi {Contact first name},
  >
  > We've reviewed your return request **{Return number}** for order **#{Order number}** ({Returned items}), and unfortunately we can't accept it.
  >
  > {Note from the store}
  >
  > If you have any questions, just reply to this email.
  >
  > Thanks,
  > {Site name}

## 4. Withdrawal received (EU acknowledgement)

The law requires confirming receipt "on a durable medium" with the content and the date and time of the withdrawal, so this email always includes them.

- **Subject:** Confirmation of your withdrawal {Withdrawal reference}
- **Body:**

  > Hi {Customer name},
  >
  > This email confirms that we received your withdrawal from the contract for order **#{Order number}** on **{Submitted at}**.
  >
  > **Reference:** {Withdrawal reference}
  > **Items:** {Withdrawn items}
  > **Your comment:** {Customer comment}
  >
  > We'll email you shortly with instructions for sending the items back. We'll refund your payment within 14 days of receiving your withdrawal; we may wait until we've received the items back or you've shown proof that you sent them.
  >
  > Please keep this email for your records.
  >
  > Thanks,
  > {Site name}

## Status (2026-11-26)

- [x] Triggers created in the app dashboard (Develop → Automations): Return requested / approved / rejected, with `contact_id` connected to the contact
- [x] Backend reports the events. Tested: a return on order #10002 triggered the automation and the run ended without errors.
- [x] Main dev site: all three automations are **active** with their own subject, heading and body using the trigger variables (`${rma_number}`, `${order_number}`, `${items_summary}`, `${reason}`, `${contact.name.first}`): "Return requested: confirmation email", "Return approved: customer email", "Return rejected: customer email". The wording was set with the builder's "Configure with AI", so it's close to, not identical to, the copy above. The rejected email includes the merchant's rejection reason (`Reason: ${merchant_note}`).
- [x] Sender: the site owner's name and email (the dev site default). Each merchant can change it in the email step's **Sender details**.
- [x] Real-inbox test (2026-11-27): requested, approved and rejected emails received at the owner's address with all variables filled in.
- [x] Exported as **pre-installed automations** (2026-11-27): all three, default status Active, merchants can edit step settings. They take effect when a released app version is installed; the triggers must be live (released) for them to run. Export path: site Automations in Advanced Mode → ⋯ → Generate link → app dashboard → Automations → Pre-installed → paste link.
- [x] Rejecting requires a reason (dashboard window + server check). It's stored as `merchant_note`, shown in the rejection email and in the order lookup widget. Approving needs no note. Tested 2026-11-27 with R10004-2.
- [x] Withdrawal (2026-11-27): trigger `withdrawal_received` created with `contact_id` connected; site automation "Withdrawal received: confirmation email" active (wording via "Configure with AI"; it signs off "The team" rather than the site name); exported as pre-installed, default Active. Real-inbox test passed.

Note: Wix's automation emails count against the **store's** email quota (200 a month on a free site).
