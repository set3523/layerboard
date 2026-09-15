// src/lib/supabaseAdmin.ts  ⚠️ 서버 전용 — service role 키 사용 (RLS 우회). 클라이언트 import 금지!
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
