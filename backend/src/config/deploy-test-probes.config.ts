import { FaultAttribution, StatusCode, type ExecuteOptions } from "piston-judger";
import type { DeployTestAttribution, DeployTestLanguage, DeployTestVerdict } from "../types/deploy-test.type";

export interface DeployTestProbeDefinition {
  id: string;
  phase: "smoke" | "verdict";
  language: DeployTestLanguage;
  scenario: "ac" | "ce" | "re" | "tle" | "mle" | "ole";
  code: string;
  stdin: string;
  expectedOutput: string;
  expectedStatus: DeployTestVerdict;
  expectedAttribution: DeployTestAttribution;
  limits: ExecuteOptions;
  /** Classification threshold may include sandbox accounting tolerance. */
  judgeMemoryLimit?: number;
}

const smokeCode: Record<DeployTestLanguage, string> = Object.freeze({
  c: '#include <stdio.h>\nint main(){int n;scanf("%d",&n);printf("%d\\n",n*2);}',
  cpp: '#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n*2<<"\\n";}',
  python: 'n=int(input())\nprint(n*2)',
});

export const SMOKE_PROBES: readonly DeployTestProbeDefinition[] = Object.freeze(
  (["c", "cpp", "python"] as const).map((language) => ({
    id: `smoke-${language}`,
    phase: "smoke" as const,
    language,
    scenario: "ac" as const,
    code: smokeCode[language],
    stdin: "21\n",
    expectedOutput: "42\n",
    expectedStatus: StatusCode.AC,
    expectedAttribution: FaultAttribution.SUBMISSION,
    limits: { run_timeout: 2_000, run_memory_limit: 64 * 1024 * 1024 },
  })),
);

export const VERDICT_PROBES: readonly DeployTestProbeDefinition[] = Object.freeze([
  { id: "verdict-ce", phase: "verdict", language: "c", scenario: "ce", code: "int main( {", stdin: "", expectedOutput: "", expectedStatus: StatusCode.CE, expectedAttribution: FaultAttribution.SUBMISSION, limits: { compile_timeout: 10_000, run_timeout: 2_000, run_memory_limit: 64 * 1024 * 1024 } },
  { id: "verdict-re", phase: "verdict", language: "c", scenario: "re", code: "int main(){int *p=0;*p=1;}", stdin: "", expectedOutput: "", expectedStatus: StatusCode.RE, expectedAttribution: FaultAttribution.SUBMISSION, limits: { run_timeout: 2_000, run_memory_limit: 64 * 1024 * 1024 } },
  { id: "verdict-tle", phase: "verdict", language: "c", scenario: "tle", code: "int main(){for(;;){}}", stdin: "", expectedOutput: "", expectedStatus: StatusCode.TLE, expectedAttribution: FaultAttribution.SUBMISSION, limits: { run_timeout: 250, run_memory_limit: 64 * 1024 * 1024 } },
  { id: "verdict-mle", phase: "verdict", language: "c", scenario: "mle", code: "#include <stdlib.h>\nint main(){size_t n=256*1024*1024;char*p=malloc(n);for(size_t i=0;i<n;i+=4096)p[i]=1;return p?0:1;}", stdin: "", expectedOutput: "", expectedStatus: StatusCode.MLE, expectedAttribution: FaultAttribution.SUBMISSION, limits: { run_timeout: 5_000, run_memory_limit: 32 * 1024 * 1024 }, judgeMemoryLimit: 32 * 1024 * 1024 - 64 * 1024 },
  { id: "verdict-ole", phase: "verdict", language: "c", scenario: "ole", code: "#include <stdio.h>\nint main(){for(;;)puts(\"01234567890123456789\");}", stdin: "", expectedOutput: "", expectedStatus: StatusCode.OLE, expectedAttribution: FaultAttribution.SUBMISSION, limits: { run_timeout: 2_000, run_memory_limit: 64 * 1024 * 1024 } },
]);

const aliases: Record<DeployTestLanguage, readonly string[]> = {
  c: ["c", "gcc"],
  cpp: ["c++", "cpp", "g++"],
  python: ["python", "python3", "py"],
};

export function resolveRuntime(
  language: DeployTestLanguage,
  runtimes: ReadonlyArray<{ language: string; version: string; aliases?: string[] }>,
): { language: string; version: string; aliases: string[] } | undefined {
  const wanted = new Set(aliases[language]);
  return runtimes.find((runtime) =>
    [runtime.language, ...(runtime.aliases ?? [])].some((name) => wanted.has(name.toLowerCase())),
  ) as { language: string; version: string; aliases: string[] } | undefined;
}
