import React from "react";
import { Users, ChevronDown, ChevronRight } from "lucide-react";
import { PeerLensEntry, PeerLensState, defaultPeerLensEntry } from "../lib/peerLens";

type Props = {
  peerNames: string[];
  /** stepId → 표시 이름 (없으면 Step n) */
  stepLabelByAuthor: Record<string, Record<string, string>>;
  stepIdsByAuthor: Record<string, string[]>;
  lens: PeerLensState;
  setLens: React.Dispatch<React.SetStateAction<PeerLensState>>;
  hidden?: boolean;
};

export default function PeerViewPanel({
  peerNames,
  stepLabelByAuthor,
  stepIdsByAuthor,
  lens,
  setLens,
  hidden,
}: Props) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  if (hidden || peerNames.length === 0) return null;

  const entry = (name: string): PeerLensEntry => lens[name] ?? defaultPeerLensEntry();

  const setEntry = (name: string, patch: Partial<PeerLensEntry>) => {
    setLens((prev) => ({
      ...prev,
      [name]: { ...entry(name), ...patch },
    }));
  };

  const toggleStep = (name: string, stepId: string) => {
    const e = entry(name);
    if (e.steps === "all") {
      const all = stepIdsByAuthor[name] ?? [stepId];
      setEntry(name, { steps: all.filter((id) => id !== stepId) });
      return;
    }
    const set = new Set(e.steps);
    if (set.has(stepId)) set.delete(stepId);
    else set.add(stepId);
    setEntry(name, { steps: set.size ? Array.from(set) : "all" });
  };

  const isStepOn = (name: string, stepId: string) => {
    const e = entry(name);
    if (e.steps === "all") return true;
    return e.steps.includes(stepId);
  };

  return (
    <div className="absolute bottom-24 left-64 w-56 gg-glass p-3 z-20 max-h-52 overflow-y-auto scale-[0.85] sm:scale-100 sm:left-72">
      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 mb-2">
        <Users size={14} className="text-leaf-600" /> 다른 참가자 필기
      </span>
      <ul className="flex flex-col gap-2">
        {peerNames.map((name) => {
          const ids = stepIdsByAuthor[name] ?? [];
          const open = expanded[name];
          const e = entry(name);
          return (
            <li key={name} className="border border-gray-100 rounded-lg p-2 bg-gray-50/80">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold text-gray-700 flex-1 text-left"
                  onClick={() => setExpanded((x) => ({ ...x, [name]: !open }))}
                >
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => setEntry(name, { visible: !e.visible })}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${e.visible ? "bg-leaf-100 text-leaf-700" : "bg-gray-200 text-gray-500"}`}
                >
                  {e.visible ? "표시" : "숨김"}
                </button>
              </div>
              {open && ids.length > 0 && (
                <div className="mt-2 flex flex-col gap-1 pl-1">
                  {ids.map((id, i) => (
                    <label key={id} className="flex items-center gap-2 text-[10px] text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isStepOn(name, id)}
                        onChange={() => toggleStep(name, id)}
                      />
                      {stepLabelByAuthor[name]?.[id] ?? `Step ${i + 1}`}
                    </label>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
