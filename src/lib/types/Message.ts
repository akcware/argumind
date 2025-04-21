export interface Message {
	role: 'user' | 'assistant' | 'separator'; // Added 'separator'
	content: string;
	agentId?: string; // Optional: ID of the agent generating the message
	agentName?: string; // Optional: Display name of the agent
	isLoading?: boolean; // Optional: Flag to indicate streaming/loading state
}
