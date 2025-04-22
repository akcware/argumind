# Argumind

Argumind is a web application that allows users to chat with multiple AI agents simultaneously and compare their responses.

[![Introduction Video](https://img.youtube.com/vi/qGirlX4-tC4/maxresdefault.jpg)](https://www.youtube.com/watch?v=qGirlX4-tC4)


## Features

*   **Multi-Agent Chat:** Interact with several AI models (OpenAI, Anthropic, Google Gemini) in parallel.
*   **Agent Selection:** Choose which agents to include in the conversation via a dropdown menu.
*   **Response Comparison:** Initiate a comparison phase where selected agents analyze each other's initial responses.
*   **Summarization:** An additional agent generates a summary table comparing the analyses.
*   **Streaming Responses:** AI responses are streamed token-by-token with a typing effect.
*   **Markdown Rendering:** Assistant responses (including comparison tables) are rendered from Markdown.
*   **Modal Display:** Assistant responses are shown in clickable badges that open a modal for detailed viewing.

## Tech Stack

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, shadcn/ui
*   **AI APIs:**
    *   OpenAI API
    *   Anthropic API
    *   Google Generative AI API
*   **Markdown:** `react-markdown`

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm, yarn, or pnpm
*   API keys for OpenAI, Anthropic, and Google AI.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd argumind
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

### Environment Variables

Create a `.env.local` file in the project root and add your API keys:

```env
# .env.local

OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_AI_API_KEY=your_google_ai_api_key
```

### Running the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Endpoints

*   `/api/chat`: Handles streaming chat responses from individual selected agents based on the conversation history.
*   `/api/compare`: Handles the comparison phase. It takes the user query and initial assistant responses, queries the relevant agents for analysis, and streams back both the analyses and a final summary table.
