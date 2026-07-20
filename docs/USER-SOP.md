# VoicEV91 Finance Invoice — User SOP (Standard Operating Procedure)

**Document for:** Normal users (invoice requesters)  
**System:** VoicEV91 Finance Invoice Process  
**Last updated:** July 2026

---

## 1. Purpose

This SOP explains how a **normal user** should use the VoicEV91 Finance Invoice system to:

1. Submit an invoice payment request  
2. Track approval and payment status  
3. Request payment of the **remaining balance** (after advance)  
4. Mark the ticket **Process Complete** when work is fully done  

Use this document as your day-to-day guide. If anything is unclear, contact your **Admin** or **department Team Head** before raising a new ticket.

---

## 2. Who this applies to

| Role | What you do in this system |
|------|----------------------------|
| **User** | Create invoice tickets, track status, request remaining payment, mark complete |
| **Team Head** | Same as User **plus** approve tickets for their department (if configured) |
| **CEO / Finance / Admin** | Not covered in detail here — they have their own screens |

---

## 3. Before you start

### 3.1 Email address (mandatory)

You must use a company email ending with:

**`@ev91riderz.com`**

Examples:
- Correct: `yourname@ev91riderz.com`
- Not allowed: `yourname@gmail.com`, `yourname@ev91.com`

### 3.2 Account approval

After **Sign up**, an **Admin** must approve your account before you can create tickets.

- If you see **“Waiting for approval”**, you cannot use the invoice page yet.  
- After approval, you will receive a notification (if email is configured) and can **Sign in**.

### 3.3 Department

Each user belongs to **one department** (e.g. EV, Supply, Operations).

Your department decides the **approval route**:

| Route | What happens |
|-------|----------------|
| **Team Head → CEO** | Your ticket goes to your department Team Head first, then to CEO, then Finance |
| **Direct to CEO** | Your ticket goes straight to CEO, then Finance |

You do not choose this — Admin configures it per department.

**Special rule:** If **you** are the department Team Head and you create a ticket yourself, it **skips** the Team Head step and goes **directly to CEO** (you cannot approve your own request).

---

## 4. Sign in and open your dashboard

1. Open the VoicEV91 Finance Invoice app in your browser.  
2. Click **Sign in**.  
3. Enter your **`@ev91riderz.com`** email and password.  
4. After login you land on **My dashboard** (invoice page).

---

## 5. Create a new invoice request (step by step)

Go to the top form: **New invoice request**.

Fill **every mandatory field** before clicking **Save ticket**.

### 5.1 Basic details

| Field | What to enter | Notes |
|-------|---------------|--------|
| **Subject** | Short title for the request | e.g. “Vendor payment — March supplies” |
| **Purpose** | Why this payment is needed | Mandatory — be clear for approvers |
| **Remark** | Extra explanation | Mandatory |
| **Invoice number** | Number from the vendor invoice | Must match your uploaded invoice |
| **Invoice Amount (₹)** | Full invoice total | Not the advance only — full bill amount |

### 5.2 Payable % (advance)

| Field | Rule |
|-------|------|
| **Payable %** | Enter **20 to 60** only |

**What this means:**  
If invoice is **₹1,00,000** and you enter **50%**, approvers see **₹50,000** as the amount to approve/pay **now** (advance). The rest can be paid later through **Pay remaining amount** (see Section 8).

The form shows a preview: *“Approval / pay now: ₹…”*

### 5.3 Priority

| Priority | Target time |
|----------|-------------|
| **High** | Same day |
| **Medium** | 48 hours |
| **Low** | 72 hours |

Choose honestly — urgent misuse slows everyone down.

### 5.4 Bank details (for Finance payment)

| Field | Example |
|-------|---------|
| **Bank name** | HDFC Bank |
| **Account number** | Vendor account number |
| **IFSC code** | e.g. HDFC0001234 |

Finance uses these to pay the vendor. Double-check — wrong details delay payment.

### 5.5 Attachments (mandatory)

| Attachment | Required? | What to upload |
|------------|-----------|----------------|
| **Invoice attachment** | Yes | Vendor invoice (PDF/image) |
| **Cheque attachment** | Yes | Cancelled cheque / cheque book page / bank proof for the account above |

### 5.6 Submit

1. Review all fields and amounts.  
2. Click **Save ticket**.  
3. Note your **Ticket code** (e.g. `AWPBU003`) — use this in all follow-ups.

You will receive email alerts (if configured) when status changes.

---

## 6. What happens after you submit (approval flow)

### Route A — Department needs Team Head approval

```
You submit
    → Awaiting Team Head
    → Team Head approves
    → Awaiting CEO
    → CEO approves
    → Ready for Finance (Pending)
    → Finance pays
    → Paid / Partially Paid
    → You mark Process Complete (when fully done)
```

### Route B — Direct to CEO

```
You submit
    → Awaiting CEO
    → CEO approves
    → Ready for Finance (Pending)
    → Finance pays
    → Paid / Partially Paid
    → You mark Process Complete (when fully done)
```

---

## 7. Ticket statuses (what they mean for you)

| Status | Meaning for you |
|--------|-----------------|
| **Awaiting Team Head** | Waiting for your department head to approve |
| **Awaiting CEO** | Waiting for CEO approval |
| **Pending** | CEO approved — Finance will pay the approved amount |
| **Partially Paid** | Some amount paid; more may still be due on the invoice |
| **Paid** | Approved cycle fully paid; if full invoice is settled you can complete |
| **Completed** | You marked Process Complete — ticket closed |
| **Rejected** | Approver rejected — read remarks and create a corrected ticket if needed |

---

## 8. Partial payment and “Pay remaining amount”

Many invoices are paid in **two stages**: advance first, balance later.

### 8.1 Example

- Invoice amount: **₹1,00,000**  
- Payable % at creation: **50%** → advance **₹50,000**  
- Finance pays **₹50,000** → status **Partially Paid** (invoice still has **₹50,000** left)

### 8.2 When advance is fully paid

When Finance has paid the full **approved advance** for that cycle:

1. Open **My tickets**.  
2. Find the ticket (filter: **Partial** or **All**).  
3. Click **Pay remaining amount**.

This sends an **urgent** request for the **remaining invoice balance** and starts approval again (Team Head and/or CEO, same rules as your department).

### 8.3 After remaining is approved and paid

- Finance pays the balance on the **same ticket** (same ticket code).  
- When the **full invoice** is paid, status becomes **Paid**.  
- Then you can **Process Complete**.

**Important:** Do not create a new ticket for the balance — always use **Pay remaining amount** on the same ticket.

---

## 9. Process Complete (closing the ticket)

When **all payment is done** and your work/process is finished:

1. Go to **My tickets**.  
2. Find the ticket with status **Paid** (full invoice settled).  
3. Click **Process Complete**.  
4. Enter **Completion remark** (mandatory).  
5. Upload **Completion attachment** if required (proof of closure/delivery).  
6. Submit.

Status changes to **Completed**. The ticket is closed.

---

## 10. Using “My tickets” (tracking)

### 10.1 Filters

| Filter | Shows |
|--------|--------|
| **All** | Every ticket |
| **In progress** | Awaiting approval or payment |
| **Partial** | Partially paid tickets |
| **Paid** | Fully paid, waiting for your completion |
| **Completed** | Closed tickets |

### 10.2 Created date filter

Filter tickets by when they were created:

- **Today** / **Yesterday** / **This week** / **Last week**  
- **Custom** — pick From and To dates  

### 10.3 Search

Search by ticket code, purpose, invoice number, status, etc.

### 10.4 Columns to watch

- **Created** — date and time you submitted  
- **Amount** — invoice total, paid amount, pending  
- **Status** — current step  
- **Files** — open Invoice / Cheque attachments  

---

## 11. Team Head users (if you are a department head)

If Admin gave you the **Team Head** role:

1. You have a **Team Head** page to approve/reject your department’s tickets.  
2. You can also click **New invoice request** to raise your own tickets.  
3. **Your own tickets** go **directly to CEO** (not to your own approval queue).

---

## 12. Do’s and Don’ts

### Do

- Use only **`@ev91riderz.com`** email  
- Enter correct **bank details** and **invoice number**  
- Upload clear **invoice** and **cheque** files  
- Use **Payable %** between 20 and 60  
- Use **Pay remaining amount** on the same ticket for balance payment  
- Add a clear **completion remark** when closing  

### Don’t

- Don’t create a second ticket for the remaining balance  
- Don’t use personal email addresses  
- Don’t enter payable % below 20 or above 60  
- Don’t skip mandatory fields or attachments  
- Don’t mark **Process Complete** before the invoice is fully paid  

---

## 13. Common problems and what to do

| Problem | What to do |
|---------|------------|
| **“Only @ev91riderz.com email addresses are allowed”** | Sign up / sign in with company email |
| **Cannot login after signup** | Wait for Admin approval, then try again |
| **“Failed to save ticket”** | Read the red error message — often a missing field or database issue; contact Admin |
| **Ticket stuck on Awaiting Team Head** | Contact your department Team Head |
| **Ticket stuck on Awaiting CEO** | Contact Admin / CEO office |
| **Advance paid but no “Pay remaining amount” button** | Advance cycle may not be fully paid yet; check Paid amount in the ticket |
| **Wrong bank details after submit** | Contact Admin — you may need a new ticket or Admin correction |
| **Rejected ticket** | Read CEO/Team Head remark, fix the issue, submit a **new** ticket |

---

## 14. Quick reference — one-page checklist

**New invoice**

- [ ] Subject, Purpose, Remark filled  
- [ ] Invoice number + Invoice Amount (₹)  
- [ ] Payable % (20–60)  
- [ ] Priority selected  
- [ ] Bank name, Account number, IFSC  
- [ ] Invoice attachment uploaded  
- [ ] Cheque attachment uploaded  
- [ ] Ticket code noted after save  

**After advance payment**

- [ ] Check status = Partially Paid  
- [ ] Click **Pay remaining amount** when button appears  
- [ ] Wait for approvals and Finance payment again  

**Closing**

- [ ] Full invoice paid  
- [ ] **Process Complete** + remark + attachment  

---

## 15. Support contacts

Configure these internally for your organisation:

| Need | Contact |
|------|---------|
| Account not approved | Admin |
| Department / Team Head routing | Admin |
| Approval delay (Team Head) | Your department Team Head |
| Approval delay (CEO) | CEO office |
| Payment / UTR / bank issue | Finance team |
| System error / login issue | Admin |

---

*End of User SOP — VoicEV91 Finance Invoice Process*
