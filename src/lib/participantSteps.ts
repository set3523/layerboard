import { Step } from "../hooks/useSteps";

export type ParticipantStepBundle = { steps: Step[]; activeStepId: string };

export const defaultStepBundle = (): ParticipantStepBundle => ({
  steps: [{ id: "step-1", name: "Step 1", isVisible: true, opacity: 1 }],
  activeStepId: "step-1",
});

/** 페이지에서 특정 참가자 step 묶음 (legacy page.steps → 방장 이름으로 이전) */
export function getParticipantBundle(
  page:
    | {
        steps?: Step[];
        activeStepId?: string;
        participantSteps?: Record<string, ParticipantStepBundle>;
      }
    | undefined,
  participantName: string,
  hostFallbackName?: string
): ParticipantStepBundle {
  if (!page) return defaultStepBundle();
  const ps = page.participantSteps?.[participantName];
  if (ps?.steps?.length) return ps;
  if (hostFallbackName && participantName === hostFallbackName && page.steps?.length) {
    const steps = page.steps;
    const activeStepId = page.activeStepId ?? steps[steps.length - 1]?.id ?? "step-1";
    return { steps, activeStepId };
  }
  return defaultStepBundle();
}

export function mergeParticipantSteps(
  page: { participantSteps?: Record<string, ParticipantStepBundle> },
  name: string,
  bundle: ParticipantStepBundle
): Record<string, ParticipantStepBundle> {
  return { ...(page.participantSteps ?? {}), [name]: bundle };
}
