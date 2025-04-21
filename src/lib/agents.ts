export interface Agent {
  producer: "OpenAI" | "Anthropic" | "Google";
  id: string;
  name: string;
  model: string;
  description: string;
  image: string;
  // Add other relevant properties if needed, e.g., provider, version
}

export const agents: Agent[] = [
  {
    producer: "OpenAI",
    id: "o3",
    name: "o3",
    model: "o3",
    description: "Advanced thinking language model by OpenAI.",
    image: "ai-logos/openai.png",
  },
  {
    producer: "OpenAI",
    id: "gpt-4.1",
    name: "GPT-4.1",
    model: "gpt-4.1",
    description: "Advanced language model by OpenAI.",
    image: "ai-logos/openai.png",
  },
  {
    producer: "Anthropic",
    id: "claude-3.7", // Assuming a hypothetical future version or typo correction
    model: "claude-3-7-sonnet-latest",
    name: "Claude 3.7", // Adjust if the actual version is different (e.g., Claude 3 Opus/Sonnet/Haiku)
    description: "Advanced thinking language model by Anthropic.",
    image: "ai-logos/anthropic.png",
  },
  {
    producer: "Google",
    id: "gemini-2.5-pro", // Assuming a hypothetical future version
    model: "gemini-2.5-pro-exp-03-25",
    name: "Gemini 2.5 Pro", // Adjust if the actual version is different (e.g., Gemini 1.5 Pro)
    description: "Advanced thinking language model by Google.",
    image: "ai-logos/gemini.png",
  },
  {
    id: "summarizer",
    name: "Summary Agent",
    producer: "OpenAI",
    model: "gpt-4.1-mini", // Use a capable model like gpt-4-turbo or gpt-4o
    description: "Summarizes and tabulates comparison results.",
    strengths: ["Summarization", "Tabulation", "Analysis"],
    image: "ai-logos/openai.png",
  },
];

export const findProducerFromId = (id: string) => {
  const agent = agents.find((agent) => agent.id === id);
  return agent ? agent.producer : undefined;
};

export const findAgentFromId = (id: string): Agent | undefined => {
  return agents.find((agent) => agent.id === id) || undefined;
};
