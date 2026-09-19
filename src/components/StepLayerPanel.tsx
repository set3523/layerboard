import React from "react";
import { Layers, Plus, Eye, EyeOff } from "lucide-react";
import { Step } from "../hooks/useSteps";

export type StepLayerPanelProps = {
  steps: Step[];
  activeStepId: string;
  onSelectStep: (id: string, nextSteps: Step[]) => void;
  onAddStep: () => void;
  onToggleVisible: (id: string, nextSteps: Step[]) => void;
  onOpacityChange: (id: string, opacity: number, nextSteps: Step[]) => void;
  title?: string;
  className?: string;
  hidden?: boolean;
};

export default function StepLayerPanel({
  steps,
  activeStepId,
  onSelectStep,
  onAddStep,
  onToggleVisible,
  onOpacityChange,
  title = "단계",
  className = "",
  hidden,
}: StepLayerPanelProps) {
  if (hidden) return null;

  return (
    <div
      className={`w-full gg-glass p-5 flex flex-col gap-3 max-h-[40vh] overflow-y-auto shrink-0 animate-in fade-in slide-in-from-right-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-leaf-600" />
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onAddStep}
          className="flex items-center gap-1 bg-leaf-50 text-leaf-600 hover:bg-leaf-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
        >
          <Plus size={14} /> 다음 단계
        </button>
      </div>
      <ul className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
        {steps.map((step) => (
          <li
            key={step.id}
            onClick={() => {
              const nextSteps = steps.map((s) => {
                if (s.id === step.id) return { ...s, opacity: 1 };
                if (s.id === activeStepId) return { ...s, opacity: 0.2 };
                return s;
              });
              onSelectStep(step.id, nextSteps);
            }}
            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${
              step.id === activeStepId
                ? "bg-leaf-50 border-leaf-300 shadow-sm"
                : "bg-white border-gray-100 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  step.id === activeStepId ? "bg-leaf-500 animate-pulse" : "bg-gray-300"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  step.id === activeStepId ? "text-leaf-700" : "text-gray-600"
                }`}
              >
                {step.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={step.opacity ?? 1}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const newOpacity = parseFloat(e.target.value);
                  const nextSteps = steps.map((s) =>
                    s.id === step.id ? { ...s, opacity: newOpacity } : s
                  );
                  onOpacityChange(step.id, newOpacity, nextSteps);
                }}
                className="w-12 accent-leaf-600"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const nextSteps = steps.map((s) =>
                    s.id === step.id ? { ...s, isVisible: !s.isVisible } : s
                  );
                  onToggleVisible(step.id, nextSteps);
                }}
                className="text-gray-400 hover:text-gray-700 transition-colors"
              >
                {step.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
