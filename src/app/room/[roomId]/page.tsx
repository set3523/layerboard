"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { getCurrentUser, getDisplayName } from "@/lib/api/auth";
import Whiteboard from "@/components/Whiteboard";

import { verifyRoomCode } from "@/lib/api/rooms";
import { getAccountStatus } from "@/lib/api/usage";
import SessionGuard from "@/components/SessionGuard";

function RoomPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = params.roomId as string;
  const role = searchParams.get("role") as "host" | "student" | null;
  const name = searchParams.get("name");

  const [isLoading, setIsLoading] = useState(true);
  const [isValidRoom, setIsValidRoom] = useState(false);
  const [maxStudents, setMaxStudents] = useState(3);
  const [needSub, setNeedSub] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState("");

  useEffect(() => {
    async function checkRoom() {
      if (!roomId || !role) {
        setIsLoading(false);
        return;
      }

      const loginNext = () => {
        const q = new URLSearchParams({ role });
        if (name) q.set("name", name);
        router.replace(`/login?next=${encodeURIComponent(`/room/${roomId}?${q.toString()}`)}`);
      };

      let authRedirect = false;
      try {
        const user = await getCurrentUser();
        if (!user) {
          authRedirect = true;
          loginNext();
          return;
        }

        const displayName = name?.trim() || getDisplayName(user);
        setUserDisplayName(displayName);

        const room = await verifyRoomCode(roomId);

        if (!room && role === "student") {
          authRedirect = true;
          router.replace(`/join/${roomId.toUpperCase()}`);
          return;
        }

        if (room) {
          setMaxStudents((room as { max_students?: number }).max_students ?? 3);
          if (role === "host") {
            if (room.host_id && user.id !== room.host_id) {
              console.warn("이 방의 소유자가 아닙니다.");
              setIsValidRoom(false);
              return;
            }
            const acct = await getAccountStatus();
            if (acct.expired) {
              setNeedSub(true);
              setIsValidRoom(false);
              return;
            }
          }

          setIsValidRoom(true);
        } else {
          setIsValidRoom(false);
        }
      } catch (error) {
        console.error("방 검증 에러:", error);
        setIsValidRoom(false);
      } finally {
        if (!authRedirect) setIsLoading(false);
      }
    }

    checkRoom();
  }, [roomId, role, name, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center flex-col gap-4 font-sans text-gray-900 selection:bg-leaf-100">
        <Loader2 size={48} className="animate-spin text-leaf-600" />
        <p className="text-gray-500 font-bold">교실 상태를 확인하고 있습니다...</p>
      </div>
    );
  }

  if (needSub) {
    return (
      <div className="flex h-screen w-full items-center justify-center font-sans px-4 text-gray-900 selection:bg-leaf-100">
        <div className="gg-glass p-10 text-center max-w-md w-full">
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">구독이 필요합니다</h2>
          <p className="text-gray-500 mb-8 font-medium leading-relaxed">
            무료체험이 종료되었어요. <br/> 구독하면 교실을 다시 열 수 있어요.
          </p>
          <button
            onClick={() => router.push("/pricing")}
            className="gg-btn gg-btn--primary gg-btn--block gg-drop"
          >
            요금제 보기
          </button>
        </div>
      </div>
    );
  }

  if (!roomId || !role || !userDisplayName || !isValidRoom) {
    return (
      <div className="flex h-screen w-full items-center justify-center font-sans px-4 text-gray-900 selection:bg-leaf-100">
        <div className="gg-glass p-10 text-center max-w-md w-full animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">입장할 수 없는 교실입니다</h2>
          <p className="text-gray-500 mb-8 font-medium leading-relaxed">
            방 코드·암호를 확인하거나, 방장이 수업을 종료했을 수 있습니다. <br/>
            학생은 입장 페이지에서 코드와 암호를 입력해 주세요.
          </p>
          <button
            onClick={() => router.push("/")}
            className="gg-btn gg-btn--ghost gg-btn--block"
          >
            메인 화면으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh overflow-hidden bg-gray-50">
      <Whiteboard
        roomId={roomId}
        role={role}
        userName={userDisplayName}
        maxStudents={maxStudents}
      />
    </div>
  );
}

export default function RoomPage() {
  return (
    <SessionGuard>
      <RoomPageContent />
    </SessionGuard>
  );
}
