import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const { data: { user } } = await supabaseAdmin.auth.getUser(token); // 토큰으로 본인 확인
    if (!user) return NextResponse.json({ error: "세션이 만료되었습니다." }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("status, current_period_end").eq("id", user.id).maybeSingle();

    if (!profile || profile.status !== "active")
      return NextResponse.json({ error: "해지할 활성 구독이 없습니다." }, { status: 400 });

    // 정책: 환불 없음. 결제한 기간(current_period_end)까지는 그대로 이용하고,
    // 자동결제만 중단(status=canceled + 카드 연결 해제). plan/기간은 유지.
    const { error: upErr } = await supabaseAdmin.from("profiles").update({
      status: "canceled",
      billing_key: null,   // 더 이상 자동결제 안 되게 카드 연결 해제
    }).eq("id", user.id);
    if (upErr) throw new Error("해지 처리 실패: " + upErr.message);

    return NextResponse.json({ ok: true, periodEnd: profile.current_period_end });
  } catch (e: any) {
    console.error("billing/cancel:", e);
    return NextResponse.json({ error: e?.message || "해지 처리 실패" }, { status: 400 });
  }
}
