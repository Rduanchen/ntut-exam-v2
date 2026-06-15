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
    };
    environmentVariables: {
        startPassword: string;
        [key: string]: string | number | boolean;
    };
    accessibleUsers: AccessUser[];
    globalSpecialRules?: SpecialRule[];
    sections: Section[];
}
