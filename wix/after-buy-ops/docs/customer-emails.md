# Customer emails: wording and remaining setup

Emails go through **Wix Automations**. The app reports `return_requested`, `return_approved` and `return_rejected` (see `src/backend/notify.ts`). Each automation is "AfterBuy Ops trigger → Send an email", and Wix sends it to the trigger's contact (`contact_id`).

Variables below refer to the trigger fields. In Wix's email editor, insert them with **+ Add variable → AfterBuy Ops**.

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

## Status (2026-11-26)

- [x] Triggers created in the app dashboard (Develop → Automations): Return requested / approved / rejected, with `contact_id` connected to the contact
- [x] Backend reports the events. Tested: a return on order #10002 triggered the automation and the run ended without errors.
- [x] Main dev site: automation "Return requested: confirmation email" is **active**, still with Wix's placeholder template ("Thanks For Getting in Touch")
- [ ] Replace the placeholder with email 1 (Automations → the automation → Edit → Send an email → Email template → Edit)
- [ ] Create the "approved" and "rejected" automations the same way (Create Automation → Start from Scratch → search "Return" → pick trigger → Action → Send an email)
- [ ] Real-inbox test: place a test order with your own email address and submit a return. The test buyer's `@example.com` address can't receive mail, and the site's email counter stayed at 0/200.
- [ ] Export the three automations as **pre-installed automations** (app dashboard → Automations → Create New → Pre-installed automation → pick the site automation) so every store gets them on install. The trigger can't be changed after publishing.
- [ ] The dashboard has no field yet for the "note from the store" on approve/reject. The API accepts `note`; add an optional text box to the Approve/Reject buttons.

Note: Wix's automation emails count against the **store's** email quota (200 a month on a free site).
