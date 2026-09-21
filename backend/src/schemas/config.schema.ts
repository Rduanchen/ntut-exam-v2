import { z, ZodError } from "zod";
import CONFIG, { LanguageKey } from "../constants/piston.config"
import { JUDGE_DEFAULTS } from "../config/judge.config"

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
        /* Judging infrastructure settings.
         *
         * Every one is optional WITH a default, and that is what implements
         * replacement-not-merge: an uploaded config.json omitting a field
         * arrives here as the default, never as the previously stored value.
         * Making any of them required would break every existing config file;
         * making them optional WITHOUT a default would let the old value
         * survive an upload, which is the behaviour the deployment model
         * explicitly rejects. */
        compileTimeout: z.number().optional().default(JUDGE_DEFAULTS.compileTimeout),
        compileMemoryLimit: z.number().optional().default(JUDGE_DEFAULTS.compileMemoryLimit),
        /* A property of the machine, not of the exam paper. It travels with
         * config.json anyway, because one file must fully define one machine;
         * the consequence is that copying a paper between machines carries a
         * ceiling sized for the wrong hardware, and the operator is told to
         * re-measure. */
        maxConcurrentJobs: z.number().optional().default(JUDGE_DEFAULTS.maxConcurrentJobs),
        maxSystemRetries: z.number().optional().default(JUDGE_DEFAULTS.maxSystemRetries),
    }),
    environmentVariables: z.object({
        startPassword: z.string().min(1, "startPassword is required"),
    }).catchall(z.union([z.string(), z.number(), z.boolean()])),

    accessibleUsers: z.array(accessUserSchema),
    globalSpecialRules: z.array(specialRuleSchema).optional(),
    sections: z.array(sectionSchema),

    /* How long submissions stay accepted after the exam is declared over.
     * Optional with a default so existing papers keep working; the value lives
     * on the paper because both ends need it and only one can be the source. */
    submitGraceSeconds: z.number().min(0).optional().default(60),
});

/* ── Feature 007: the paper, split ────────────────────────────────────────
 *
 * The device AES key protects transport, but the student holds it — so it
 * cannot keep the paper unreadable on that student's own machine. A second
 * key does that, and the backend withholds it until the exam starts.
 *
 * Everything a machine needs *before* then goes in the meta part: the roster,
 * the languages to probe, the limits to probe them at. Everything that would
 * tell a student what the exam is about goes in the ciphered part — including
 * puzzle titles, which give the subject away.
 */

const encryptedEnvelopeSchema = z.object({
    iv: z.string(),
    ciphertext: z.string(),
    tag: z.string(),
});

export const wrappedExamKeySchema = z.object({
    salt: z.string(),
    iv: z.string(),
    ciphertext: z.string(),
    tag: z.string(),
});

/** A puzzle as it appears before the exam starts: enough to probe, no more. */
const puzzleSkeletonSchema = z.object({
    id: z.string(),
    language: languageSchema,
    timeLimit: z.number().optional(),
    memoryLimit: z.number().optional(),
});

const sectionSkeletonSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    maxScore: z.number().min(0),
    puzzles: z.array(puzzleSkeletonSchema),
});

export const examConfigMetaSchema = z.object({
    testTitle: z.string(),
    description: z.string(),
    accessibleUsers: z.array(accessUserSchema),
    judgerSettings: z.object({
        timeLimit: z.number(),
        memoryLimit: z.number(),
        compareMode: z.enum(["strict", "loose"]).optional(),
        compileTimeout: z.number().optional(),
        compileMemoryLimit: z.number().optional(),
        maxConcurrentJobs: z.number().optional(),
        maxSystemRetries: z.number().optional(),
    }),
    submitGraceSeconds: z.number().min(0).optional(),
    sections: z.array(sectionSkeletonSchema),
    wrappedExamKey: wrappedExamKeySchema,
});

/** The half that stays unreadable until the exam starts. */
export const examConfigSecretSchema = z.object({
    puzzles: z.array(z.object({
        id: z.string(),
        title: z.string(),
        score: z.number().min(0),
        subtasks: z.array(subtaskSchema),
        specialRules: z.array(specialRuleSchema).optional(),
    })),
    globalSpecialRules: z.array(specialRuleSchema).optional(),
});

export const examConfigPayloadSchema = z.object({
    meta: examConfigMetaSchema,
    cipher: encryptedEnvelopeSchema,
});

export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;
export type WrappedExamKey = z.infer<typeof wrappedExamKeySchema>;
export type ExamConfigMeta = z.infer<typeof examConfigMetaSchema>;
export type ExamConfigSecret = z.infer<typeof examConfigSecretSchema>;
export type ExamConfigPayload = z.infer<typeof examConfigPayloadSchema>;

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
