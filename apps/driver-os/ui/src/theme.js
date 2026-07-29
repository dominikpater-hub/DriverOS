// theme.js — DriverOS UI theme tokens.
//
// M5.0: extracted out of the ADR trainer, where the palette originally lived
// only because that screen was written first. Colours are a UI concern of the
// DriverOS shell (the Franek face + launcher), not of any single module, so
// they belong here. Every screen (Dashboard, KnowledgeQA, and the ADR trainer
// once it lands from its own session) consumes the same tokens.
export const C = {
  bg: "#0E1117", card: "#171B22", line: "#232833", edge: "#2C3340",
  text: "#E8EAED", dim: "#6B7280", faint: "#4B515C",
  red: "#C1121F", green: "#1B7F4B", greenLite: "#5FA777",
  amber: "#D98F3F", danger: "#D98880",
  skill: "#C1121F", fact: "#5FA777", ref: "#6B7280",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
