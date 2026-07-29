// Recorded-shape fixtures matching the real Anthropic Messages API response body.
// Used to test AnthropicDirectProvider's parsing without hitting the network.
// If the API response shape changes, these are the canary — update deliberately.

export const anthropicTextResponse = {
  id: "msg_fixture_01",
  type: "message",
  role: "assistant",
  model: "claude-haiku-4-5",
  content: [
    {
      type: "text",
      text: "Bleib ruhig und zeige deine Dokumente. Du hast das Recht zu schweigen.",
    },
  ],
  stop_reason: "end_turn",
  usage: { input_tokens: 320, output_tokens: 41 },
};

export const anthropicMultiBlockResponse = {
  id: "msg_fixture_02",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [
    { type: "text", text: "First part." },
    { type: "text", text: "Second part." },
  ],
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 12 },
};

export const anthropicErrorResponse = {
  status: 429,
  body: { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
};
