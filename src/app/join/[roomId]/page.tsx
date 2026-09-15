"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCurrentUser, getDisplayName } from "@/lib/api/auth";
import { verifyRoomCode } from "@/lib/api/rooms";

export default function JoinWaitingRoom() {
  const params = useParams();
  const router = useRouter();
  const roomId = (params.roomId as string).toUpperCase();
  const [ready, setReady] = useState(false);
  const [joining, setJoining] = useState(false);
  const [studentName, setStudentName] = useState("");

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
    setJoining(true);
    try {
      const room = await verifyRoomCode(roomId);
      if (!room) {
        alert("방 코드가 올바르지 않거나 수업이 종료되었습니다.");
        return;
      }
      router.push(`/room/${roomId}?role=student&name=${encodeURIComponent(name)}`);
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
