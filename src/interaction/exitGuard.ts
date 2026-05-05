export interface InteractiveExitProcess {
  kind: "process";
  id: string;
  pid: number;
  summary: string;
}

export interface InteractiveExitTerminationResult {
  terminatedPids: number[];
  failedPids: number[];
}

export interface InteractiveExitGuard {
  collectRunningProcesses(cwd: string): Promise<InteractiveExitProcess[]>;
  terminateProcesses(processes: InteractiveExitProcess[]): Promise<InteractiveExitTerminationResult>;
}

export const defaultInteractiveExitGuard: InteractiveExitGuard = {
  async collectRunningProcesses() {
    return [];
  },
  async terminateProcesses() {
    return {
      terminatedPids: [],
      failedPids: [],
    };
  },
};
