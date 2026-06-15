import { z, ZodError } from "zod";
import CONFIG, { LanguageKey } from "../constants/piston.config"

const supportedLanguages = Object.keys(CONFIG.languages) as [
    LanguageKey,
    ...LanguageKey[],
];

const languageSchema = z.enum(supportedLanguages);

const ruleConstraintSchema = z.enum(["MUST_HAVE", "MUST_NOT_HAVE"]);

const specialRuleSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        id: z.string(),
        type: z.enum(["regex", "use", "composite", "nestedLoop"]),
        constraint: ruleConstraintSchema,
        message: z.string(),
        severity: z.enum(["info", "warn"]).optional(),
        multiplier: z.number().min(0).max(1).optional().default(1),
        params: z.unknown(),
    }),
);

const testCaseSchema = z.object({
    input: z.string(),
    output: z.string(),
});

const subtaskSchema = z.object({
    title: z.string(),
    score: z.number().min(0),
    visible: z.array(testCaseSchema),
    hidden: z.array(testCaseSchema),
});

const puzzleSchema = z.object({
    id: z.string(),
    title: z.string(),
    score: z.number().min(0),
    language: languageSchema,
    timeLimit: z.number().optional(),
    memoryLimit: z.number().optional(),
    subtasks: z.array(subtaskSchema),
    specialRules: z.array(specialRuleSchema).optional(),
});


const sectionSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    maxScore: z.number().min(0),
    puzzles: z.array(puzzleSchema),
});

const accessUserSchema = z.object({
    id: z.string(),
    name: z.string(),
    ip: z.union([z.string().ip(), z.literal("")]).optional(),
});

export const examConfigSchema = z.object({
    testTitle: z.string(),
    description: z.string(),
    judgerSettings: z.object({
        timeLimit: z.number(),
        memoryLimit: z.number(),
        compareMode: z.enum(["strict", "loose"]).optional().default("loose"),
    }),
    environmentVariables: z.object({
        startPassword: z.string().min(1, "startPassword is required"),
    }).catchall(z.union([z.string(), z.number(), z.boolean()])),

    accessibleUsers: z.array(accessUserSchema),
    globalSpecialRules: z.array(specialRuleSchema).optional(),
    sections: z.array(sectionSchema),
});

export type ExamConfig = z.infer<typeof examConfigSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Puzzle = z.infer<typeof puzzleSchema>;
export type SubTask = z.infer<typeof subtaskSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type AccessUser = z.infer<typeof accessUserSchema>;

export type SpecialRule = z.infer<typeof specialRuleSchema>;
export type RuleConstraint = z.infer<typeof ruleConstraintSchema>;


export const verifyExamConfig = (config: any) => {
    try {
        return {
            examConfig: examConfigSchema.parse(config),
            isCorrect: true,
            errors: null,
        };
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                examConfig: null,
                isCorrect: false,
                errors: error.issues,
            };
        }

        return {
            examConfig: null,
            isCorrect: false,
            errors: [{ message: "Unknown error" }],
        };
    }
};
