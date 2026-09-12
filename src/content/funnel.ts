import type { PublicSession } from "@/shared/contracts";
import {
  answerOptions,
  questionIds,
  type AnswerId,
  type QuestionId,
} from "@/shared/funnel-definition";

type QuestionCopy = {
  [Q in QuestionId]: {
    eyebrow: string;
    title: string;
    description: string;
    options: Record<AnswerId<Q>, readonly [string, string, string]>;
  };
};
const questionCopy = {
  intent: {
    eyebrow: "YOUR WORLD, YOUR WAY",
    title: "What brings you to ChaChat?",
    description: "There’s no right answer. Just what feels like you.",
    options: {
      talk: [
        "Someone to talk to",
        "A little company, whenever you need it",
        "✦",
      ],
      story: [
        "Interactive stories & role-play",
        "Step into a world of your own",
        "☾",
      ],
      create: ["Create a character", "Bring your imagination to life", "✎"],
      inspiration: ["Creative inspiration", "Find your next spark", "☀"],
    },
  },
  character_type: {
    eyebrow: "MEET YOUR MATCH",
    title: "Who would you like to meet first?",
    description: "Every great conversation starts with a connection.",
    options: {
      friend: [
        "A supportive friend",
        "Easy conversation. A familiar feeling.",
        "♡",
      ],
      romantic: [
        "A romantic companion",
        "A connection with a little chemistry",
        "❀",
      ],
      fantasy: [
        "A fantasy or story character",
        "Someone from another world",
        "☾",
      ],
      surprise: ["Surprise me", "Let curiosity lead the way", "✦"],
    },
  },
  interaction_mode: {
    eyebrow: "FIND YOUR RHYTHM",
    title: "How do you want to connect?",
    description: "Make the conversation feel natural to you.",
    options: {
      text: [
        "Text conversations",
        "A thought, a message, a new direction",
        "≋",
      ],
      voice: ["Voice conversations", "Hear your character come to life", "♫"],
      images: [
        "AI-generated images",
        "Give your imagination a visual world",
        "▧",
      ],
      mix: ["A mix of everything", "Explore all the possibilities", "✦"],
    },
  },
  memory: {
    eyebrow: "MAKE IT PERSONAL",
    title: "What should your character remember?",
    description: "A little context can make your next chat feel more you.",
    options: {
      interests: ["My interests", "The things I love talking about", "♡"],
      story: ["Our ongoing story", "Pick up where the adventure left off", "☾"],
      boundaries: [
        "My preferences & boundaries",
        "The details that matter to me",
        "◇",
      ],
      casual: ["Let’s keep it casual", "A fresh conversation, any time", "☀"],
    },
  },
  usage_moment: {
    eyebrow: "A MOMENT FOR YOU",
    title: "When would ChaChat fit into your day?",
    description: "Find a little space for a different kind of conversation.",
    options: {
      daily: ["A daily check-in", "A familiar hello in my routine", "☀"],
      unwind: [
        "When I want to unwind",
        "Slow down and settle into a chat",
        "☾",
      ],
      story: [
        "Immersive story sessions",
        "Time to get lost in another world",
        "✦",
      ],
      creative: ["In my creative moments", "Follow an idea somewhere new", "✎"],
    },
  },
} as const satisfies QuestionCopy;

export const questions = questionIds.map((id) => {
  const content: {
    eyebrow: string;
    title: string;
    description: string;
    options: Record<string, readonly [string, string, string]>;
  } = questionCopy[id];
  return {
    id,
    eyebrow: content.eyebrow,
    title: content.title,
    description: content.description,
    options: answerOptions[id].map(
      (answerId) => [answerId, ...content.options[answerId]] as const,
    ),
  };
});

export const APP_STORE_URL =
  "https://apps.apple.com/us/app/chachat-talking-ai-character/id6444773124";
export function matchSummary(answers: PublicSession["answers"]) {
  const character =
    {
      friend: "a supportive friend",
      romantic: "a romantic companion",
      fantasy: "a fantasy storyteller",
      surprise: "an unexpected new character",
    }[answers.character_type?.[0] ?? ""] ?? "a character that feels like you";
  const mode =
    {
      text: "thoughtful text conversations",
      voice: "expressive voice chats",
      images: "AI-generated imagery",
      mix: "text, voice, and visual possibilities",
    }[answers.interaction_mode?.[0] ?? ""] ?? "new conversations";
  return {
    title:
      answers.character_type?.[0] === "fantasy"
        ? "Your next chapter starts here."
        : "Your kind of connection awaits.",
    description: `Start with ${character} and explore ${mode}. Your answers are a starting point—you choose where the conversation goes.`,
  };
}

export const copy = {
  brand: "ChaChat",
  brandLabel: "ChaChat home",
  headerNote: "A little curiosity. A new connection.",
  ageBadge: "18+",
  footer: ["Made for your imagination.", "AI characters. Real curiosity."],
  loading: "Getting your experience ready…",
  reconnectTitle: "Let’s reconnect.",
  retry: "Try again",
  back: "Go back",
  yourMatch: "YOUR MATCH",
  step: (index: number, total: number) => `Step ${index} of ${total}`,
  landing: {
    eyebrow: "A WORLD OF CHARACTERS. ONE THAT CLICKS.",
    title: "Meet an AI character made for",
    emphasis: "your kind of conversation.",
    lead: "A friend. A co-creator. Your next great story.",
    detail: "Discover a connection that starts with you.",
    features: ["✦ Unique characters", "♫ Text & voice", "☾ Stories & memory"],
    age: "I confirm that I am 18 or older",
    starting: "Starting…",
    start: "Find my character",
    caption: "5 questions · About a minute · Made for you",
  },
  quiz: {
    saving: "Saving…",
    continue: "Continue",
    note: "Your answers help shape your recommendation.",
  },
  email: {
    eyebrow: "A LITTLE MORE YOU",
    matchReady: "Your character match is ready.",
    save: "Save your result and discover your plan.",
    label: "Your email address",
    placeholder: "you@example.com",
    saving: "Saving your match…",
    reveal: "Reveal my offer",
    note: "Your email connects this result to your demo purchase.",
    noEmail: "We won’t send email from this demo.",
  },
  paywall: {
    eyebrow: "YOUR NEXT CONVERSATION STARTS HERE",
    title: "Make room for",
    emphasis: "a little possibility.",
    benefits: [
      "✦ Discover and create AI characters",
      "♫ Explore text, voice, and interactive stories",
      "♡ Build conversations with remembered context",
    ],
  },
  install: {
    eyebrow: "YOUR DEMO PURCHASE IS COMPLETE",
    title: "Say hello to",
    emphasis: "your next chapter.",
    confirmed: "Your demo purchase is confirmed for",
    description:
      "Download ChaChat on your iPhone to explore AI characters, conversations, and new stories.",
    download: "Download on the App Store",
    device: "For iPhone · Ages 18+",
    note: "This demo purchase does not grant a paid subscription in the app.",
  },
  checkout: {
    choose: "Choose your plan",
    best: "BEST VALUE",
    reserved:
      "Your checkout plan is reserved. Failed payments can be retried below.",
    demo: "DEMO CHECKOUT · NO REAL CHARGE",
    demoDetails:
      "Use test details only. This demo does not activate an app subscription.",
    cards: "View demo cards",
    cardRules: [
      { label: "Success", number: "4242 4242 4242 4242" },
      { label: "Decline", number: "4000 0000 0000 0002" },
      { label: "Timeout", number: "4000 0000 0000 9995" },
    ],
    cardHint: "Use any future expiry and a 3-digit CVC.",
    paymentDetails: "Payment details",
    name: "Name on card",
    namePlaceholder: "Demo User",
    number: "Card number",
    numberPlaceholder: "4242 4242 4242 4242",
    expiry: "Expiry date",
    expiryPlaceholder: "MM/YY",
    cvc: "Security code",
    cvcPlaceholder: "CVC",
    country: "Country",
    postal: "Postal code",
    postalPlaceholder: "10001",
    countries: [
      ["US", "United States"],
      ["GB", "United Kingdom"],
      ["CA", "Canada"],
      ["AU", "Australia"],
      ["DE", "Germany"],
      ["FR", "France"],
      ["IN", "India"],
      ["JP", "Japan"],
      ["BR", "Brazil"],
      ["NL", "Netherlands"],
    ],
    checking: "Checking checkout…",
    processing: "Processing demo payment…",
    recover: "Recover my payment",
    continue: (name: string, amount: string) =>
      `Continue with ${name} · ${amount}`,
    privacy:
      "No money is charged. Card details are never saved. This is a demonstration of the checkout experience.",
    loadingPlans: "Loading your plans…",
    retryPlans: "Retry loading plans",
    noPlans: "No plans are available right now. Please try again shortly.",
    failed: "Payment didn’t go through. Check the demo card and try again.",
    reconnecting:
      "We couldn’t check your payment status. Reconnecting automatically…",
    interrupted:
      "The connection was interrupted. We’re checking the result. If needed, resubmit the same card to safely recover this attempt.",
  },
  art: {
    sceneLabel: "Illustrated character conversation preview",
    portraitLabel: "Illustrated AI character with purple hair",
    world: "Explore another world",
    connection: "YOUR NEXT CONNECTION",
    caption: "A conversation. A possibility.",
    description: "Always something new to discover.",
    greeting: "Hey, you. Where should our story begin?",
    tag: "✧ A little more your world",
  },
  errors: {
    request: "Something went wrong. Please try again.",
    invalidResponse: "We received an unexpected response. Please try again.",
    coordination:
      "We couldn’t safely start your session. Close any other ChaChat tabs and try again with browser storage enabled.",
    sessionChanged:
      "Your session changed in another tab. Refresh this page to continue safely.",
    connect: "Couldn’t connect. Please try again.",
    saveAnswer: "Couldn’t save your answer. Try again.",
    email: "Please check your email and try again.",
    plans: "Plans could not load. Please try again.",
  },
} as const;
