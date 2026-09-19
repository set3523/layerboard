"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCurrentUser, getDisplayName } from "@/lib/api/auth";
import { joinRoom } from "@/lib/api/rooms";
import { formatUserFacingError } from "@/lib/api/errorMessage";
import SessionGuard from "@/components/SessionGuard";

const joinErrorMessage: Record<string, string> = {
  invalid_code: "방 코드가 올바르지 않거나 수업이 종료되었습니다.",
  wrong_passphrase: "입장 암호가 올바르지 않습니다.",
  rate_limited: "시도 횟수가 많습니다. 1분 후 다시 시도해 주세요.",
  full: "정원이 가득 찼습니다. 방장에게 문의해 주세요.",
  not_authenticated: "로그인이 필요합니다.",
};

function JoinWaitingRoomContent() {
  const params = useParams();
  const router = useRouter();
  const roomId = (params.roomId as string).toUpperCase();
  const [ready, setReady] = useState(false);
  const [joining, setJoining] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [passphrase, setPassphrase] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentUser();
      if (cancelled) return;
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(`/join/${roomId}`)}`);
        return;
      }
      setStudentName(getDisplayName(user));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = studentName.trim();
    if (!name) {
      alert("이름을 입력해주세요!");
      return;
    }
    if (!passphrase.trim()) {
      alert("입장 암호를 입력해주세요.");
      return;
    }
    setJoining(true);
    try {
      const result = await joinRoom(roomId, passphrase);
      if (result !== "ok") {
        const bizCode = `[JOIN_${result.toUpperCase()}]`;
        alert(`${bizCode} ${joinErrorMessage[result] ?? "입장에 실패했습니다."}`);
        return;
      }
      router.push(`/room/${roomId}?role=student&name=${encodeURIComponent(name)}`);
    } catch (e) {
      alert(formatUserFacingError(e));
    } finally {
      setJoining(false);
    }
  };

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center font-sans text-gray-900 selection:bg-leaf-100">
        <Loader2 size={40} className="animate-spin text-leaf-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center font-sans text-gray-900 selection:bg-leaf-100">
      <form onSubmit={handleJoin} className="gg-glass p-8 w-full max-w-sm text-center">
        <h2 className="text-2xl font-bold mb-2 text-gray-800">수업 입장하기</h2>
        <p className="text-sm text-gray-500 mb-6">방 코드 {roomId}</p>
        <input
          type="text"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          placeholder="이름을 입력하세요"
          className="w-full p-4 mb-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-leaf-500 transition-all text-center text-lg font-bold text-gray-900 placeholder:text-gray-400"
          maxLength={10}
          autoComplete="name"
        />
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="입장 암호"
          className="w-full p-4 mb-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-leaf-500 transition-all text-center text-lg font-bold text-gray-900 placeholder:text-gray-400"
          minLength={4}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={joining}
          className="gg-btn gg-btn--primary gg-btn--block gg-drop disabled:opacity-70"
        >
          {joining ? "확인 중…" : "입장하기"}
        </button>
      </form>
    </div>
  );
}

export default function JoinWaitingRoom() {
  return (
    <SessionGuard enableIdleLogout>
      <JoinWaitingRoomContent />
    </SessionGuard>
  );
}
