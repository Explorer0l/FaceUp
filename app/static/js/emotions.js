// Shared emotion config — must match the server's EMOTION_GROUPS keys/order.
// `grad` is the radial gradient that tints the Vibe hero for each emotion: the
// signature link between the face engine and the music UI.
export const EMOTIONS = {
  happy: {
    emoji: "😄",
    color: "#ffd24a",
    grad: "radial-gradient(60% 70% at 68% 38%,#ffd24a 0%,#ff5ca0 45%,#3a1340 100%)",
  },
  sad: {
    emoji: "😢",
    color: "#5aa9ff",
    grad: "radial-gradient(60% 70% at 68% 38%,#5aa9ff 0%,#2b3aa0 45%,#11163a 100%)",
  },
  angry: {
    emoji: "😠",
    color: "#ff5c5c",
    grad: "radial-gradient(60% 70% at 68% 38%,#ff7a59 0%,#b02525 45%,#350f0f 100%)",
  },
  neutral: {
    emoji: "😐",
    color: "#9aa0a6",
    grad: "radial-gradient(60% 70% at 68% 38%,#aeb4ba 0%,#4a5560 45%,#1a1f26 100%)",
  },
};

export const EMOTION_ORDER = Object.keys(EMOTIONS);

// Focus mode isn't an emotion but reuses the same visual language.
export const FOCUS = {
  color: "#7bcf6a",
  grad: "radial-gradient(60% 70% at 68% 38%,#7bcf6a 0%,#1f7a55 45%,#0c2a22 100%)",
};

export function emotionColor(name) {
  return (EMOTIONS[name] || EMOTIONS.neutral).color;
}
export function emotionEmoji(name) {
  return (EMOTIONS[name] || EMOTIONS.neutral).emoji;
}
