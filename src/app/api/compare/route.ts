import { NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { Message } from "@/lib/types/Message";
import { findAgentFromId, Agent } from "@/lib/agents";

// Initialize clients
const openai = new OpenAI();
const anthropic = new Anthropic();
const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

// Define the summarizer agent ID
const SUMMARIZER_AGENT_ID = "summarizer";

// Helper function to construct the comparison prompt for a specific agent
const constructComparisonPrompt = (
  userQuery: Message,
  assistantResponses: Message[],
  targetAgent: Agent
): string => {
  let prompt = `The user asked the following query: "${userQuery.content}"\n\n`;
  prompt += `In response, several AI agents (including potentially yourself, ${targetAgent.name}) provided these arguments:\n\n`;

  assistantResponses.forEach((response) => {
    prompt += `--- Response from ${
      response.agentName || response.agentId
    } ---\n`;
    prompt += `${response.content}\n\n`;
    prompt += `-------------------------------------\n\n`;
  });

  prompt += `--- Your Task (${targetAgent.name}) ---\n`;
  prompt += `As ${targetAgent.name}, please analyze all the arguments presented above in relation to the original user query. Evaluate their strengths, weaknesses, points of agreement, and points of divergence. Offer your unique perspective or synthesis based on the discussion so far. Focus on providing a comparative analysis. Response with users language and tone in mind.`;
  return prompt;
};

// Helper to construct summarizer prompt
const constructSummarizerPrompt = (
  userQuery: Message,
  comparisonResponses: { agentName: string; content: string }[]
): string => {
  let prompt = `The user asked: "${userQuery.content}"\n\n`;
  prompt += `Multiple agents provided analyses comparing initial responses. Here are their analyses:\n\n`;
  comparisonResponses.forEach((comp) => {
    prompt += `--- Analysis from ${comp.agentName} ---\n`;
    prompt += `${comp.content}\n\n`;
    prompt += `-------------------------------------\n\n`;
  });
  prompt += `--- Your Task (Summary Agent) ---\n`;
  // Emphasize returning ONLY the table more strictly
  prompt += `Based on all the preceding analyses, create ONLY a concise summary table in Markdown format. The table should highlight key strengths, weaknesses, agreements, and disagreements. IMPORTANT: Your entire response MUST be ONLY the Markdown table itself. Start directly with the table header row (e.g., "| Feature | Agent A | ... |") and end immediately after the last table row. Do not include any introductory text, explanations, code block fences (\`\`\`), or concluding remarks.`;
  return prompt;
};

// Helper function to encode data for the stream
const encodeStreamData = (
  type: string,
  agentId: string,
  agentName: string,
  content: string | null = null,
  error: string | null = null
): string => {
  return JSON.stringify({ type, agentId, agentName, content, error }) + "\n";
};

export async function POST(req: Request) {
  try {
    const { userQuery, assistantResponses } = await req.json();

    // Validation for userQuery and assistantResponses
    if (
      !userQuery ||
      !assistantResponses ||
      !Array.isArray(assistantResponses) ||
      assistantResponses.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing or invalid userQuery or assistantResponses" },
        { status: 400 }
      );
    }
    const agentIdsToQuery = [
      ...new Set(assistantResponses.map((r) => r.agentId).filter((id) => id)),
    ];
    if (agentIdsToQuery.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid agent IDs found in assistantResponses to perform comparison.",
        },
        { status: 400 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const comparisonResultsMap = new Map<
          string,
          { agentName: string; content: string }
        >(); // Store results for summarizer

        const comparisonPromises = agentIdsToQuery.map(async (agentId) => {
          const agent = findAgentFromId(agentId as string);
          if (!agent) {
            console.warn(
              `Agent details not found for ID: ${agentId}. Skipping.`
            );
            controller.enqueue(
              encoder.encode(
                encodeStreamData(
                  "error",
                  agentId,
                  `Unknown Agent (${agentId})`,
                  null,
                  "Agent configuration not found."
                )
              )
            );
            return;
          }

          const prompt = constructComparisonPrompt(
            userQuery,
            assistantResponses,
            agent
          );
          const systemMessage =
            "You are an expert analyst comparing arguments from multiple AI agents.";
          const agentAnalysisName = `${agent.name} (Analysis)`;
          let fullContent = ""; // Accumulate content for summarizer

          try {
            switch (agent.producer) {
              case "OpenAI":
                const openaiStream = await openai.chat.completions.create({
                  model: agent.model,
                  messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: prompt },
                  ],
                  stream: true,
                });
                for await (const chunk of openaiStream) {
                  const content = chunk.choices[0]?.delta?.content || "";
                  if (content) {
                    fullContent += content; // Accumulate
                    controller.enqueue(
                      encoder.encode(
                        encodeStreamData(
                          "chunk",
                          agent.id,
                          agentAnalysisName,
                          content
                        )
                      )
                    );
                  }
                }
                break;

              case "Anthropic":
                const anthropicStream = await anthropic.messages.stream({
                  model: agent.model,
                  system: systemMessage,
                  messages: [{ role: "user", content: prompt }],
                  max_tokens: 1024,
                });
                for await (const event of anthropicStream) {
                  if (
                    event.type === "content_block_delta" &&
                    event.delta.type === "text_delta"
                  ) {
                    fullContent += event.delta.text; // Accumulate
                    controller.enqueue(
                      encoder.encode(
                        encodeStreamData(
                          "chunk",
                          agent.id,
                          agentAnalysisName,
                          event.delta.text
                        )
                      )
                    );
                  }
                }
                break;

              case "Google":
                if (!genAI) {
                  throw new Error("Google AI client not initialized.");
                }
                const stream = await genAI.models.generateContentStream({
                  model: agent.model,
                  contents: prompt,
                });

                for await (const chunk of stream) {
                  const text = chunk.text;
                  if (text) {
                    fullContent += text; // Accumulate
                    controller.enqueue(
                      encoder.encode(
                        encodeStreamData(
                          "chunk",
                          agent.id,
                          agentAnalysisName,
                          text
                        )
                      )
                    );
                  }
                }
                break;

              default:
                throw new Error(`Unsupported producer: ${agent.producer}`);
            }
            // Store result for summarizer and signal end
            comparisonResultsMap.set(agent.id, {
              agentName: agentAnalysisName,
              content: fullContent,
            });
            controller.enqueue(
              encoder.encode(
                encodeStreamData("end", agent.id, agentAnalysisName)
              )
            );
          } catch (error) {
            console.error(
              `Error streaming comparison from ${agent.name}:`,
              error
            );
            const errorMsg =
              error instanceof Error
                ? error.message
                : "Unknown error during streaming.";
            comparisonResultsMap.set(agent.id, {
              agentName: agentAnalysisName,
              content: `Error during analysis: ${errorMsg}`,
            });
            controller.enqueue(
              encoder.encode(
                encodeStreamData(
                  "error",
                  agent.id,
                  agentAnalysisName,
                  null,
                  errorMsg
                )
              )
            );
          }
        });

        // Wait for all individual comparisons
        await Promise.all(comparisonPromises);

        // --- Summarization Step ---
        const summarizerAgent = findAgentFromId(SUMMARIZER_AGENT_ID);
        if (summarizerAgent && comparisonResultsMap.size > 0) {
          const comparisonResponsesArray = Array.from(
            comparisonResultsMap.values()
          );
          const summarizerPrompt = constructSummarizerPrompt(
            userQuery,
            comparisonResponsesArray
          );
          const summarizerAgentName = `${summarizerAgent.name} (Table)`; // Unique name
          // Add system message for stricter output control
          const summarizerSystemMessage =
            "You are an AI assistant that ONLY outputs well-formatted Markdown tables based on the provided analysis. You do not output any other text or formatting.";

          try {
            if (summarizerAgent.producer === "OpenAI") {
              const summaryStream = await openai.chat.completions.create({
                model: summarizerAgent.model,
                messages: [
                  { role: "system", content: summarizerSystemMessage },
                  { role: "user", content: summarizerPrompt },
                ],
                stream: true,
              });
              for await (const chunk of summaryStream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                  controller.enqueue(
                    encoder.encode(
                      encodeStreamData(
                        "chunk",
                        summarizerAgent.id,
                        summarizerAgentName,
                        content
                      )
                    )
                  );
                }
              }
              controller.enqueue(
                encoder.encode(
                  encodeStreamData("end", summarizerAgent.id, summarizerAgentName)
                )
              );
            } else {
              throw new Error(
                `Summarizer agent producer ${summarizerAgent.producer} not implemented.`
              );
            }
          } catch (error) {
            console.error(
              `Error streaming summary from ${summarizerAgent.name}:`,
              error
            );
            const errorMsg =
              error instanceof Error ? error.message : "Unknown summary error.";
            controller.enqueue(
              encoder.encode(
                encodeStreamData(
                  "error",
                  summarizerAgent.id,
                  summarizerAgentName,
                  null,
                  errorMsg
                )
              )
            );
          }
        } else if (!summarizerAgent) {
          console.warn("Summarizer agent not found.");
        }

        controller.close(); // Close the main stream after everything
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error initializing comparison stream:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
