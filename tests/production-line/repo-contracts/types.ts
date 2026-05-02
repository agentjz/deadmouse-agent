export interface RepoContractFinding {
  file?: string;
  line?: number;
  message: string;
}

export interface RepoContractScanInput {
  root: string;
  files: string[];
  contents: Map<string, string>;
}

export interface RepoContract {
  id: string;
  description: string;
  scan(input: RepoContractScanInput): Promise<RepoContractFinding[]>;
}

export interface RepoContractReportedFinding extends RepoContractFinding {
  contract: string;
  description: string;
}
