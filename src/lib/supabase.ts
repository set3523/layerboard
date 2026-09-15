// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// 1. .env.local 파일에 적어둔 암호(키)를 불러옵니다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 2. 키가 없을 경우를 대비한 안전 장치 (디버깅용)
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("🚨 Supabase 환경 변수가 설정되지 않았습니다! .env.local 파일을 확인하고 서버를 재시작해주세요.");
}

// 3. Supabase 클라이언트를 생성하여 외부로 내보냅니다.
// 이제 다른 파일에서 import { supabase } from '@/lib/supabase' 한 줄만 쓰면 DB와 바로 통신됩니다!
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,      // 세션을 localStorage에 저장 (새로고침·페이지 이동에도 유지)
    autoRefreshToken: true,    // 액세스 토큰 만료 전 자동 갱신
    detectSessionInUrl: true,  // OAuth 리다이렉트 후 URL의 세션 자동 처리
  },
});