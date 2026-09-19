/** 학생 화면 전용 — 「모두」 공개된 동료 필기 필터 (로컬만) */
export type PeerLensEntry = {
  visible: boolean;
  /** 'all' 또는 켜 둔 stepId 목록 */
  steps: "all" | string[];
};

export type PeerLensState = Record<string, PeerLensEntry>;

export const defaultPeerLensEntry = (): PeerLensEntry => ({
  visible: true,
  steps: "all",
});

export function collectAuthorStepIds(
  objects: { authorName?: string; stepId?: string; authorRole?: string }[],
  authorName: string
): string[] {
  const ids = new Set<string>();
  for (const o of objects) {
    if (o.authorName === authorName && o.authorRole === "student" && o.stepId) {
      ids.add(o.stepId);
    }
  }
  return Array.from(ids).sort();
}
