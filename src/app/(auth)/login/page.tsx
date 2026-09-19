// src/app/(auth)/login/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, MonitorPlay, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithSocial,
  safeRedirectPath,
  resendSignupVerificationEmail,
  signOut,
} from "@/lib/api/auth";
import {
  claimDeviceSession,
  confirmTakeoverOtherDevice,
  getDeviceSessionStatus,
} from "@/lib/deviceSession";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeRedirectPath(searchParams.get("next"));
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // 상태 관리 (로딩 중인지, 에러가 났는지)
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showEmailVerificationHelp, setShowEmailVerificationHelp] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState("");
  const [isResending, setIsResending] = useState(false);

  const translateError = (error: any) => {
    const msg = error?.message || "";
    
    if (msg.includes("rate limit")) return "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    if (msg.includes("already registered")) return "이미 가입된 이메일입니다. 로그인을 진행해 주세요.";
    if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 일치하지 않습니다.";
    if (msg.includes("Password should be at least")) return "비밀번호는 6자리 이상이어야 합니다.";
    if (msg.includes("Email not confirmed")) return "이메일 인증이 필요합니다.";
    
    // 우리가 예상치 못한 에러일 경우에만 원래 영어 에러를 괄호에 넣어서 보여줍니다.
    return `오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (${msg})`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setVerificationNotice("");
    setShowEmailVerificationHelp(false);

    // ✨ [세련된 방어막] 아이디(@ 앞부분)가 정확히 금지어와 일치할 때만 차단.
    //    (기존 includes 방식은 info@, best@ 같은 정상 이메일까지 막던 버그)
    const localPart = email.toLowerCase().trim().split("@")[0];
    const restrictedWords = ["test", "admin", "demo", "fake", "noreply", "no-reply"];

    if (restrictedWords.includes(localPart)) {
      setIsLoading(false);
      return setErrorMessage("보안 및 스팸 방지 정책에 따라 가입이 제한된 이메일 주소입니다. 실제 사용 중인 개인 이메일을 입력해 주세요.");
    }

    const afterAuthDeviceCheck = async (): Promise<boolean> => {
      const { userId, status } = await getDeviceSessionStatus();
      if (!userId) return false;
      if (status === "other" && !confirmTakeoverOtherDevice()) {
        await signOut();
        setErrorMessage("다른 기기에서 로그인 중이라 이 기기에서는 로그인하지 않았습니다.");
        return false;
      }
      await claimDeviceSession();
      return true;
    };

    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        if (!(await afterAuthDeviceCheck())) return;
        router.push(nextPath);
      } else {
        const data = await signUpWithEmail(email, password);
        setIsLogin(true);
        if (data.session) {
          if (!(await afterAuthDeviceCheck())) return;
          router.push(nextPath);
          return;
        }
        setShowEmailVerificationHelp(true);
        setVerificationNotice(
          "가입이 완료되었습니다. 이메일로 보낸 인증 링크를 눌러 주세요. 메일이 없으면 스팸함도 확인해 주세요."
        );
        setIsLoading(false);
        return;
      }
    } catch (error: any) {
      console.error("인증 에러:", error);
      // ✨ 바로 이 부분! 무서운 영어 에러 대신 번역기를 통과시킨 한국어를 에러 메시지로 세팅합니다.
      const translated = translateError(error);
      setErrorMessage(translated);
      if (error?.message?.includes("Email not confirmed")) {
        setShowEmailVerificationHelp(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMessage("인증 메일을 받을 이메일 주소를 입력해 주세요.");
      return;
    }
    setIsResending(true);
    setErrorMessage("");
    try {
      await resendSignupVerificationEmail(trimmed);
      setVerificationNotice("인증 메일을 다시 보냈습니다. 몇 분 후에도 없으면 스팸함을 확인해 주세요.");
      setShowEmailVerificationHelp(true);
    } catch (error: unknown) {
      const msg =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: string }).message)
          : "";
      if (msg.includes("rate limit")) {
        setErrorMessage("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        setErrorMessage(translateError({ message: msg }));
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleSocialLogin = async (provider: "google") => {
    try {
      setErrorMessage("");
      // 소셜 로그인은 함수 호출 한 방이면 Supabase가 알아서 페이지를 넘겨줍니다.
      await signInWithSocial(provider, nextPath);
    } catch (error: any) {
      console.error("소셜 로그인 에러:", error);
      setErrorMessage("소셜 로그인 중 문제가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900 selection:bg-leaf-100">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-3xl tracking-tight text-leaf-600 mb-6 transition-transform hover:scale-105">
          <MonitorPlay size={32} />
          <span>layboad</span>
        </Link>
        <h2 className="text-3xl font-extrabold text-gray-900">
          {isLogin ? "로그인" : "회원가입"}
        </h2>
        {nextPath !== "/dashboard" && (
          <p className="mt-2 text-sm text-leaf-700 font-medium">수업 입장을 위해 로그인해 주세요.</p>
        )}
        <p className="mt-2 text-sm text-gray-600">
          {isLogin ? "아직 계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMessage("");
              setVerificationNotice("");
              setShowEmailVerificationHelp(false);
            }}
            className="font-bold text-leaf-600 hover:text-leaf-500 transition-colors"
          >
            {isLogin ? "무료로 가입하기" : "로그인하기"}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="gg-glass py-8 px-4 sm:px-10">
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* 에러 메시지 표시 영역 */}
            {errorMessage && (
              <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100 text-center animate-in shake">
                {errorMessage}
              </div>
            )}

            {verificationNotice && (
              <div className="p-3 bg-leaf-50 text-leaf-800 text-sm font-medium rounded-xl border border-leaf-100 text-center">
                {verificationNotice}
              </div>
            )}

            {showEmailVerificationHelp && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center space-y-3">
                <p className="text-sm text-gray-600">
                  인증 메일이 오지 않았나요?
                </p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isResending || isLoading}
                  className="gg-btn gg-btn--glass w-full text-sm font-semibold disabled:opacity-70"
                >
                  {isResending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> 보내는 중…
                    </>
                  ) : (
                    "인증 메일 다시 보내기"
                  )}
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700">이메일 주소</label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-leaf-500 focus:border-leaf-500 outline-none transition-all bg-gray-50 focus:bg-white"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700">비밀번호</label>
              <div className="mt-2 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-leaf-500 focus:border-leaf-500 outline-none transition-all bg-gray-50 focus:bg-white"
                  placeholder="6자리 이상 입력해주세요"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="gg-btn gg-btn--primary gg-btn--block gg-drop disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>{isLogin ? "로그인" : "가입하기"} <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-gray-500 font-medium">또는 소셜 계정으로 1초 만에 시작하기</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => handleSocialLogin("google")}
                className="gg-btn gg-btn--glass gg-btn--block"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 size={40} className="animate-spin text-leaf-600" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}