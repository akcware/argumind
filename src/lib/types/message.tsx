// Define a common message type
// Note: Adapters might be needed when sending to specific APIs (e.g., Gemini's 'parts' structure)
export type Message = {
	role: 'system' | 'user' | 'assistant'; // Common roles
	content: string; // Content is typically a string, though some APIs support richer content
	agentId?: string; // Optional: ID of the agent generating the message
	agentName?: string; // Optional: Name of the agent for display
};

