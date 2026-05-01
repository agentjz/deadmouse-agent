import type { CapabilityPortInput } from "../protocol/port.js";
import type { CapabilityRunnerType } from "../protocol/runner.js";

type PortInput = Omit<CapabilityPortInput, "runner"> & {
  runner: Omit<CapabilityPortInput["runner"], "type">;
};

export function executionPort(type: CapabilityRunnerType, input: PortInput): CapabilityPortInput {
  return {
    ...input,
    runner: {
      type,
      ...input.runner,
    },
  };
}

export function nonExecutionPort(type: CapabilityRunnerType, input: PortInput): CapabilityPortInput {
  const closeout = input.closeout;
  const wake = input.wake;
  return executionPort(type, {
    ...input,
    runner: {
      createsExecution: false,
      emitsWakeSignal: false,
      ...input.runner,
    },
    closeout: {
      ...closeout,
      required: closeout.required ?? false,
      contract: "CloseoutContract",
      requiredEvidence: closeout.requiredEvidence ?? [],
      mergeProposal: closeout.mergeProposal ?? "none",
    },
    wake: {
      ...wake,
      required: wake.required ?? false,
      reasons: wake.reasons ?? [],
    },
  });
}
