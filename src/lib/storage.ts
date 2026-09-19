// src/lib/storage.ts
import { supabase } from "./supabase";

const currentUserFolder = async (): Promise<string> => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "anon";
};

/** Supabase Storage 객체 경로 (버킷 제외). DB room_pages.background.path 에 저장 */
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

    return filePath;
  } catch (error) {
    console.error("클라우드 업로드 중 오류 발생:", error);
    throw error;
  }
};

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

  return filePath;
};

/** HTTP signed/public URL 또는 path → 버킷 내 객체 path */
export const storageObjectPath = (
  pathOrUrl: string,
  bucket: "backgrounds" | "captures" = "backgrounds"
): string => {
  if (!pathOrUrl.startsWith("http")) return pathOrUrl;
  const decoded = decodeURIComponent(pathOrUrl);
  const m =
    decoded.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/) ??
    decoded.match(new RegExp(`/${bucket}/(.+?)(?:\\?|$)`));
  return m?.[1] ?? pathOrUrl;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * private bucket → same-origin data URL (Fabric toDataURL / 자르기용, CORS taint 방지)
 */
export const downloadStorageAsDataUrl = async (
  pathOrUrl: string,
  bucket: "backgrounds" | "captures" = "backgrounds"
): Promise<string> => {
  const path = storageObjectPath(pathOrUrl, bucket);
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    console.error("Storage download 실패:", error);
    throw new Error("파일을 불러올 수 없습니다.");
  }
  return blobToDataUrl(data);
};

/** public URL(레거시) 또는 storage path → signed URL (private bucket) */
export const resolveStorageUrl = async (
  pathOrUrl: string,
  bucket: "backgrounds" | "captures" = "backgrounds"
): Promise<string> => {
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;
  if (pathOrUrl.startsWith("http") && !pathOrUrl.includes("/storage/v1/object/")) {
    return pathOrUrl;
  }

  const path = storageObjectPath(pathOrUrl, bucket);

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    console.error("signed URL 생성 실패:", error);
    throw new Error("파일을 불러올 수 없습니다.");
  }
  return data.signedUrl;
};
