export type UserRole = 'user' | 'team_head' | 'finance' | 'admin' | 'ceo'
export type TicketStatus =
  | 'awaiting_team_head'
  | 'awaiting_ceo'
  | 'pending'
  | 'partial'
  | 'paid'
  | 'completed'
  | 'rejected'

export type TicketPriority = 'high' | 'medium' | 'low'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  is_approved: boolean
  approved_at: string | null
  approved_by: string | null
  department_id: string | null
  created_at: string
  departments?: Department | null
}

export interface Department {
  id: string
  name: string
  requires_team_head_approval: boolean
  team_head_emails: string
  created_at: string
}

export interface Ticket {
  id: string
  ticket_code: string
  user_id: string
  department_id: string
  subject: string
  remark: string | null
  purpose: string | null
  amount: number
  payable_percent: number | null
  payable_amount: number | null
  priority: TicketPriority
  due_at: string | null
  invoice_number: string | null
  bank_name: string | null
  account_number: string | null
  ifsc_code: string | null
  bill_path: string
  bill_name: string
  cheque_path: string | null
  cheque_name: string | null
  user_cheque_path: string | null
  user_cheque_name: string | null
  status: TicketStatus
  urgent: boolean
  remaining_requested_at: string | null
  team_head_approved_by: string | null
  team_head_approved_by_name: string | null
  team_head_approved_at: string | null
  team_head_remark: string | null
  ceo_approved_by: string | null
  ceo_approved_by_name: string | null
  ceo_approved_at: string | null
  ceo_remark: string | null
  paid_by: string | null
  paid_by_name: string | null
  paid_amount: number | null
  utr_number: string | null
  paid_at: string | null
  last_payment_amount: number | null
  payment_history: string | null
  approval_history: string | null
  completion_remark: string | null
  completion_path: string | null
  completion_name: string | null
  completed_at: string | null
  created_at: string
  profiles?: Profile | null
  departments?: Department | null
}
