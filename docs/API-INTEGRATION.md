# VoicEV91 Finance Invoice — API Integration Guide

Use these APIs from another dashboard (Postman, Retool, custom UI, etc.).

## Base config

| Item | Value |
|------|--------|
| **Base URL** | `https://xnjnuonhymjblynoxmgw.supabase.co` |
| **Anon Key** | `sb_publishable_DHBzBV8G_D4bR6LORPQx5w_6FI628BV` |
| **Auth header** | `Authorization: Bearer <ACCESS_TOKEN>` |
| **API key header** | `apikey: <ANON_KEY>` |

### Common headers

```http
apikey: sb_publishable_DHBzBV8G_D4bR6LORPQx5w_6FI628BV
Authorization: Bearer <USER_ACCESS_TOKEN or ANON_KEY>
Content-Type: application/json
Prefer: return=representation
```

> After login, always use the user’s `access_token` in `Authorization`.

---

## 1. Auth APIs

### 1.1 Sign up (User only)
`POST /auth/v1/signup`

```http
POST https://xnjnuonhymjblynoxmgw.supabase.co/auth/v1/signup
apikey: <ANON_KEY>
Content-Type: application/json
```

```json
{
  "email": "user@company.com",
  "password": "secret123",
  "data": {
    "full_name": "John Doe",
    "role": "user"
  }
}
```

### 1.2 Login
`POST /auth/v1/token?grant_type=password`

```http
POST https://xnjnuonhymjblynoxmgw.supabase.co/auth/v1/token?grant_type=password
apikey: <ANON_KEY>
Content-Type: application/json
```

```json
{
  "email": "user@company.com",
  "password": "secret123"
}
```

**Response:** `{ access_token, refresh_token, user }`

### 1.3 Logout
`POST /auth/v1/logout`

```http
POST https://xnjnuonhymjblynoxmgw.supabase.co/auth/v1/logout
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```
X
### 1.4 Get current user
`GET /auth/v1/user`

```http
GET https://xnjnuonhymjblynoxmgw.supabase.co/auth/v1/user
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

---

## 2. Profiles APIs

### 2.1 Get my profile
`GET /rest/v1/profiles?id=eq.<USER_UUID>&select=*`

```http
GET https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/profiles?id=eq.USER_UUID&select=*
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

### 2.2 Get all profiles (Admin / Finance)
`GET /rest/v1/profiles?select=*&order=created_at.desc`

```http
GET https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/profiles?select=*&order=created_at.desc
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

### 2.3 Update user role (Admin)
`PATCH /rest/v1/profiles?id=eq.<USER_UUID>`

```http
PATCH https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/profiles?id=eq.USER_UUID
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
Prefer: return=representation
```

```json
{
  "role": "finance"
}
```

Roles: `user` | `finance` | `admin`

---

## 3. Departments APIs

### 3.1 List departments
`GET /rest/v1/departments?select=*&order=name.asc`

```http
GET https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/departments?select=*&order=name.asc
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

### 3.2 Add department (Admin)
`POST /rest/v1/departments`

```http
POST https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/departments
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
Prefer: return=representation
```

```json
{
  "name": "Outsourcer"
}
```

### 3.3 Delete department (Admin)
`DELETE /rest/v1/departments?id=eq.<DEPT_UUID>`

```http
DELETE https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/departments?id=eq.DEPT_UUID
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

---

## 4. Tickets APIs (main finance)

### 4.1 List my tickets (User)
`GET /rest/v1/tickets?user_id=eq.<USER_UUID>&select=*,departments(*)&order=created_at.desc`

```http
GET https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/tickets?user_id=eq.USER_UUID&select=*,departments(*)&order=created_at.desc
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

### 4.2 List all tickets (Finance / Admin)
`GET /rest/v1/tickets?select=*,profiles!user_id(*),departments(*)&order=created_at.desc`

```http
GET https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/tickets?select=*,profiles!user_id(*),departments(*)&order=created_at.desc
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

### 4.3 Filter by status
`GET /rest/v1/tickets?status=eq.pending&select=*,profiles!user_id(*),departments(*)`

Status values: `pending` | `paid` | `completed`

### 4.4 Create ticket (User)
`POST /rest/v1/tickets`

```http
POST https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/tickets
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
Prefer: return=representation
```

```json
{
  "ticket_code": "ABCDE001",
  "user_id": "USER_UUID",
  "department_id": "DEPT_UUID",
  "subject": "Vendor payment March",
  "remark": "Optional note",
  "amount": 15000.50,
  "bill_path": "bills/USER_UUID/123_bill.pdf",
  "bill_name": "bill.pdf",
  "status": "pending"
}
```

### 4.5 Mark as Paid (Finance)
`PATCH /rest/v1/tickets?id=eq.<TICKET_UUID>`

```http
PATCH https://xnjnuonhymjblynoxmgw.supabase.co/rest/v1/tickets?id=eq.TICKET_UUID
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
Prefer: return=representation
```

```json
{
  "status": "paid",
  "paid_by": "FINANCE_USER_UUID",
  "paid_by_name": "Priya Finance",
  "paid_at": "2026-07-14T10:30:00.000Z"
}
```

### 4.6 Mark as Completed (User)
`PATCH /rest/v1/tickets?id=eq.<TICKET_UUID>`

```json
{
  "status": "completed",
  "completion_remark": "Received payment",
  "completion_path": "completions/USER_UUID/123_proof.pdf",
  "completion_name": "proof.pdf",
  "completed_at": "2026-07-14T12:00:00.000Z"
}
```

---

## 5. Ticket counter APIs

### 5.1 Get current counter
`GET /rest/v1/ticket_counters?id=eq.1&select=last_number`

### 5.2 Update counter
`PATCH /rest/v1/ticket_counters?id=eq.1`

```json
{
  "last_number": 2
}
```

Ticket format: **5 letters + 3 digits** → example `ABCDE001`

---

## 6. User credentials APIs (Admin directory)

### 6.1 List credentials (Admin)
`GET /rest/v1/user_credentials?select=*&order=created_at.desc`

### 6.2 Save / update credential
`POST /rest/v1/user_credentials`  
(or upsert with `Prefer: resolution=merge-duplicates`)

```json
{
  "user_id": "USER_UUID",
  "email": "user@company.com",
  "password_text": "secret123",
  "full_name": "John Doe",
  "role": "user",
  "updated_at": "2026-07-14T10:00:00.000Z"
}
```

### 6.3 Update credential role
`PATCH /rest/v1/user_credentials?user_id=eq.<USER_UUID>`

```json
{
  "role": "finance",
  "updated_at": "2026-07-14T10:00:00.000Z"
}
```

---

## 7. Storage APIs (bill files)

Bucket: `invoice-files`

### 7.1 Upload bill / completion file
`POST /storage/v1/object/invoice-files/<path>`

```http
POST https://xnjnuonhymjblynoxmgw.supabase.co/storage/v1/object/invoice-files/bills/USER_UUID/123_bill.pdf
apikey: <ANON_KEY>
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/pdf
x-upsert: false
```

Body: raw file bytes (multipart/binary)

### 7.2 Public file URL
```
GET https://xnjnuonhymjblynoxmgw.supabase.co/storage/v1/object/public/invoice-files/<path>
```

Example:
```
https://xnjnuonhymjblynoxmgw.supabase.co/storage/v1/object/public/invoice-files/bills/USER_UUID/123_bill.pdf
```

---

## Quick method summary

| Module | Method | Endpoint | Who |
|--------|--------|----------|-----|
| Sign up | **POST** | `/auth/v1/signup` | Public |
| Login | **POST** | `/auth/v1/token?grant_type=password` | Public |
| Logout | **POST** | `/auth/v1/logout` | Logged in |
| Current user | **GET** | `/auth/v1/user` | Logged in |
| My profile | **GET** | `/rest/v1/profiles?id=eq.{id}` | User |
| All profiles | **GET** | `/rest/v1/profiles` | Admin/Finance |
| Update role | **PATCH** | `/rest/v1/profiles?id=eq.{id}` | Admin |
| List depts | **GET** | `/rest/v1/departments` | All |
| Add dept | **POST** | `/rest/v1/departments` | Admin |
| Delete dept | **DELETE** | `/rest/v1/departments?id=eq.{id}` | Admin |
| My tickets | **GET** | `/rest/v1/tickets?user_id=eq.{id}` | User |
| All tickets | **GET** | `/rest/v1/tickets` | Finance/Admin |
| Create ticket | **POST** | `/rest/v1/tickets` | User |
| Pay ticket | **PATCH** | `/rest/v1/tickets?id=eq.{id}` | Finance |
| Complete ticket | **PATCH** | `/rest/v1/tickets?id=eq.{id}` | User |
| Get counter | **GET** | `/rest/v1/ticket_counters?id=eq.1` | User |
| Update counter | **PATCH** | `/rest/v1/ticket_counters?id=eq.1` | User |
| Credentials | **GET** | `/rest/v1/user_credentials` | Admin |
| Save credential | **POST** | `/rest/v1/user_credentials` | Admin/User |
| Upload file | **POST** | `/storage/v1/object/invoice-files/{path}` | User |
| View file | **GET** | `/storage/v1/object/public/invoice-files/{path}` | Public |

---

## Integration flow (another dashboard)

1. **POST** login → save `access_token`
2. **GET** profile → check `role` (`user` / `finance` / `admin`)
3. Route screens by role
4. Call tickets / departments / pay / complete APIs with that token
5. Use storage upload before creating ticket (bill is mandatory)

## Status flow

```
pending  →  (Finance Pay)  →  paid  →  (User Process Complete)  →  completed
```
