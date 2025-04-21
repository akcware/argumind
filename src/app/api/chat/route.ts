import { NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
// Correct import for Google GenAI SDK based on example
import { GoogleGenAI } from "@google/genai";
import { Message } from "@/lib/types/Message";
import { findAgentFromId, Agent } from "@/lib/agents";
// Assuming adapters exist and adaptMessagesForGemini produces the correct format for history
import { adaptMessagesForGemini } from "@/lib/adapters";

// Initialize clients
const openai = new OpenAI();
const anthropic = new Anthropic();
// Correct initialization using apiKey named argument based on example
const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
  : null;

// Helper function to encode stream data (can be shared or redefined)
const encodeStreamData = (
  type: string,
  content: string | null = null,
  error: string | null = null
): string => {
  // agentId/agentName might not be needed here if the frontend knows which stream belongs to which agent
  return JSON.stringify({ type, content, error }) + "\n";
};

export async function POST(req: Request) {
  try {
    const { messages, agentId } = await req.json();

    if (!messages || !agentId) {
      return NextResponse.json(
        { error: "Missing messages or agentId" },
        { status: 400 }
      );
    }

    const agent = findAgentFromId(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: `Agent with ID ${agentId} not found` },
        { status: 404 }
      );
    }

    // Get last user message content *before* adapting for history
    const lastUserMessageContent = messages[messages.length - 1].content;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          switch (agent.producer) {
            case "OpenAI":
              const openaiStream = await openai.chat.completions.create({
                model: agent.model,
                messages: messages,
                stream: true,
              });
              for await (const chunk of openaiStream) {
                const content = chunk.choices[0]?.delta?.content || "";
                if (content) {
                  controller.enqueue(
                    encoder.encode(encodeStreamData("chunk", content))
                  );
                }
              }
              break;

            case "Anthropic":
              const systemPrompt = messages.find(
                (m) => m.role === "system"
              )?.content;
              const userMessages = messages.filter(
                (m) => m.role !== "system"
              ) as Anthropic.Messages.MessageParam[];

              const anthropicStream = await anthropic.messages.stream({
                model: agent.model,
                system: systemPrompt,
                messages: userMessages,
                max_tokens: 1024, // Adjust as needed
              });
              for await (const event of anthropicStream) {
                if (
                  event.type === "content_block_delta" &&
                  event.delta.type === "text_delta"
                ) {
                  controller.enqueue(
                    encoder.encode(encodeStreamData("chunk", event.delta.text))
                  );
                }
              }
              break;

            case "Google":
              if (!genAI) throw new Error("Google AI client not initialized.");

              // Adapt messages specifically for Gemini's history format (excluding the last message)
              // Assumes adaptMessagesForGemini returns the correct format: { role: "user" | "model", parts: [{ text: string }] }[]
              const geminiHistory = adaptMessagesForGemini(
                messages.slice(0, -1)
              );

              // Create chat session with history
              const chat = genAI.chats.create({
                model: agent.model,
                history: geminiHistory,
              });

              // Send the last message content and stream the response
              const resultStream = await chat.sendMessageStream({
                // The example uses { message: string }, let's adapt if needed
                // If it expects parts: [{ text: string }], use that instead.
                // Assuming simple string message based on example's `sendMessageStream({ message: "..." })`
                message: lastUserMessageContent,
              });

              // Iterate through the stream
              for await (const chunk of resultStream) {
                // Use chunk.text as per the example
                const text = chunk.text;
                if (text) {
                  controller.enqueue(
                    encoder.encode(encodeStreamData("chunk", text))
                  );
                }
              }
              break;

            default:
              throw new Error(`Unsupported producer: ${agent.producer}`);
          }
          // Signal end of stream for this agent
          controller.enqueue(encoder.encode(encodeStreamData("end")));
        } catch (error) {
          console.error(`Error streaming from ${agent.name}:`, error);
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Unknown error during streaming.";
          controller.enqueue(
            encoder.encode(encodeStreamData("error", null, errorMsg))
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error in POST /api/chat:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
