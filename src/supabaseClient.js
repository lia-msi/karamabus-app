import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ljdcrpdoqjnibjeghoxq.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqZGNycGRvcWpuaWJqZWdob3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzU5NTMsImV4cCI6MjA4MzgxMTk1M30.J_Nrkf9iJE1XPRULXbXU7q5WAn66u6oJXWc-dOJCFTw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)