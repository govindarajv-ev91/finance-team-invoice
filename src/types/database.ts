export type UserRole = 'user' | 'finance' | 'admin'
export type TicketStatus = 'pending' | 'paid' | 'completed'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface Department {
  id: string
  name: string
  created_at: string
}

export interface Ticket {
  id: string
  ticket_code: string
  user_id: string
  department_id: string
  subject: string
  remark: string | null
  amount: number
  bill_path: string
  bill_name: string
  status: TicketStatus
  paid_by: string | null
  paid_by_name: string | null
  paid_at: string | null
  completion_remark: string | null
  completion_path: string | null
  completion_name: string | null
  completed_at: string | null
  created_at: string
  profiles?: Profile | null
  departments?: Department | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'> & { created_at?: string }
        Update: Partial<Profile>
      }
      departments: {
        Row: Department
        Insert: Omit<Department, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Department>
      }
      tickets: {
        Row: Ticket
        Insert: Omit<Ticket, 'id' | 'created_at' | 'profiles' | 'departments'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Ticket>
      }
      ticket_counters: {
        Row: { id: number; last_number: number }
        Insert: { id?: number; last_number: number }
        Update: Partial<{ id: number; last_number: number }>
      }
    }
  }
}
