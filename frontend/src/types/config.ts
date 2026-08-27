export type LanguageKey = string;

export type RuleConstraint = "MUST_HAVE" | "MUST_NOT_HAVE";

export interface SpecialRule {
    id: string;
    type: "regex" | "use" | "composite" | "nestedLoop";
    constraint: RuleConstraint;
    message: string;
    severity?: "info" | "warn";
    multiplier?: number;
    params: any;
}

export interface TestCase {
    input: string;
    output: string;
}

export interface SubTask {
    title: string;
    score: number;
    visible: TestCase[];
    hidden: TestCase[];
}

export interface Puzzle {
    id: string;
    title: string;
    score: number;
    language: LanguageKey;
    timeLimit?: number;
    memoryLimit?: number;
    subtasks: SubTask[];
    specialRules?: SpecialRule[];
}

export interface Section {
    id: string;
    title: string;
    description?: string;
    maxScore: number;
    puzzles: Puzzle[];
}

export interface AccessUser {
    id: string;
    name: string;
    ip?: string;
}

export interface ExamConfig {
    testTitle: string;
    description: string;
    judgerSettings: {
        timeLimit: number;
        memoryLimit: number;
        compareMode?: "strict" | "loose";
        /* Added in feature 004. This block described the pre-004 schema for
         * some time and nothing caught it, because nothing binds this type to
         * the backend's. Binding them is recorded as a finding, not attempted
         * here — but the standalone `typecheck` script added alongside makes
         * the next drift visible on demand rather than only at build time. */
        compileTimeout?: number;
        compileMemoryLimit?: number;
        /** A property of THIS MACHINE that nonetheless travels with the exam
         *  paper, because one config file must fully define one machine.
         *  Re-measure it whenever a paper moves to different hardware. */
        maxConcurrentJobs?: number;
        maxSystemRetries?: number;
    };
    environmentVariables: {
        startPassword: string;
        [key: string]: string | number | boolean;
    };
    accessibleUsers: AccessUser[];
    globalSpecialRules?: SpecialRule[];
    sections: Section[];
}
