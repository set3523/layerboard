// src/lib/storage.ts
import { supabase } from "./supabase";

// 업로드한 사람(선생님)별로 폴더를 나눠서 저장 → 선생님별 Storage 사용량 집계가 가능해짐.
// 경로: {userId}/{파일명}  (RPC 의 storage.foldername(name)[1] == userId 로 매칭)
const currentUserFolder = async (): Promise<string> => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "anon";
};

export const uploadFileToCloud = async (file: File): Promise<string> => {
  try {
    const folder = await currentUserFolder();
    const fileExt = file.name.split(".").pop();
    const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("backgrounds")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("Supabase 업로드 에러:", uploadError);
      throw new Error("파일 업로드에 실패했습니다.");
    }

    const { data } = supabase.storage.from("backgrounds").getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error("클라우드 업로드 중 오류 발생:", error);
    throw error;
  }
};

// 화면 캡처 등 dataURL(base64) 을 Storage 에 올리고 public URL 반환
export const uploadDataUrlToCloud = async (
  dataUrl: string,
  bucket: string = "captures"
): Promise<string> => {
  const folder = await currentUserFolder();
  const blob = await (await fetch(dataUrl)).blob();
  const filePath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.png`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, { contentType: "image/png", upsert: false });

  if (error) {
    console.error("캡처 업로드 에러:", error);
    throw new Error("캡처 업로드에 실패했습니다.");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
};
