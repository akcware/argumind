import { Message } from './types/Message'; // Adjust path if necessary

// Define the structure Gemini expects
type GeminiMessagePart = {
	text: string;
};

type GeminiMessage = {
	role: 'user' | 'model';
	parts: GeminiMessagePart[];
};

/**
 * Adapts the common Message format to the format expected by Google Gemini API.
 * Filters out 'system' messages as Gemini handles system instructions differently.
 * Maps 'assistant' role to 'model'.
 * @param messages Array of messages in the common format.
 * @returns Array of messages formatted for Gemini.
 */
export const adaptMessagesForGemini = (messages: Message[]): GeminiMessage[] => {
	return messages
		.filter((message) => message.role === 'user' || message.role === 'assistant') // Filter out system messages
		.map((message) => ({
			role: message.role === 'user' ? 'user' : 'model', // Map roles
			parts: [{ text: message.content }] // Structure content into parts
		}));
};

// You can add adapters for other APIs (OpenAI, Anthropic) here if needed,
// although OpenAI's format often matches the common Message type directly.
