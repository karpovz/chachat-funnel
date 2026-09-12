/** The key order is the quiz order. IDs and accepted answers have one source. */
export const answerOptions = {
  intent: ["talk", "story", "create", "inspiration"],
  character_type: ["friend", "romantic", "fantasy", "surprise"],
  interaction_mode: ["text", "voice", "images", "mix"],
  memory: ["interests", "story", "boundaries", "casual"],
  usage_moment: ["daily", "unwind", "story", "creative"],
} as const;

export type QuestionId = keyof typeof answerOptions;
export type AnswerId<Q extends QuestionId> = (typeof answerOptions)[Q][number];
export const questionIds = Object.keys(answerOptions) as QuestionId[];
export const funnelScreens = [
  "landing",
  ...questionIds,
  "email",
  "paywall",
  "install",
] as const;
export const FUNNEL_VERSION = "character-match-v1";
