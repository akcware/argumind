import React from "react";
import ReactMarkdown from "react-markdown";
import Image from "next/image"; // Import next/image
import { Message } from "@/lib/types/Message";
import { findAgentFromId } from "@/lib/agents"; // Import agent finder
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import styles from './markdown-styles.module.css'; // Import the CSS module

interface ChatMessageProps {
  message: Message;
  isLoading?: boolean;
}

// Helper function to convert Markdown Table to HTML Table
function convertMarkdownTableToHtml(markdown: string): string {
  if (!markdown || typeof markdown !== 'string') return '';

  const lines = markdown.trim().split('\n');
  if (lines.length < 2) return markdown; // Not enough lines for a header and separator

  // Basic check for table structure
  const isTable = lines[0].trim().startsWith('|') &&
                  lines[0].trim().endsWith('|') &&
                  lines[1].includes('|---');

  if (!isTable) {
    return ''; // Return empty string if it doesn't look like a table for ReactMarkdown fallback
  }

  let html = '<table class="min-w-full divide-y divide-gray-300 border border-gray-300">'; // Add basic styling classes

  // Process header
  const headerCells = lines[0].split('|').map(cell => cell.trim()).filter((cell, index, arr) => index > 0 && index < arr.length -1); // Filter empty cells from pipes
  if (headerCells.length > 0) {
    html += '<thead class="bg-gray-50"><tr>'; // Add basic styling classes
    headerCells.forEach(cell => {
      html += `<th scope="col" class="px-3 py-2 text-left text-sm font-semibold text-gray-900 border-l border-gray-300 first:border-l-0">${cell}</th>`; // Add basic styling classes
    });
    html += '</tr></thead>';
  }

  // Process body rows
  html += '<tbody class="divide-y divide-gray-200 bg-white">'; // Add basic styling classes
  for (let i = 2; i < lines.length; i++) {
     // Skip separator line
     if (lines[i].includes('|---')) continue;

    const rowCells = lines[i].split('|').map(cell => cell.trim()).filter((cell, index, arr) => index > 0 && index < arr.length -1); // Skip first/last empty cells from pipes
     if (rowCells.length > 0 && rowCells.length === headerCells.length) { // Ensure cell count matches header
       html += '<tr>';
       rowCells.forEach(cell => {
         // Basic sanitization: escape '<' and '>' to prevent HTML injection
         const sanitizedCell = cell.replace(/</g, '&lt;').replace(/>/g, '&gt;');
         html += `<td class="whitespace-normal px-3 py-2 text-sm text-gray-500 border-l border-gray-300 first:border-l-0">${sanitizedCell}</td>`; // Add basic styling classes
       });
       html += '</tr>';
     }
  }
  html += '</tbody></table>';

  return html;
}

export function ChatMessage({ message, isLoading }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isSeparator = message.role === "separator";
  const agentName = message.agentName || message.agentId || "Assistant";
  const agent = !isUser ? findAgentFromId(message.agentId || "") : undefined; // Find agent data

  if (isSeparator) {
    return (
      <div className="my-4 flex items-center justify-center">
        <span className="text-xs font-medium text-muted-foreground px-3 py-1 bg-muted rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  // --- User Message Rendering ---
  if (isUser) {
    return (
      <div className="flex items-start space-x-3 py-3 justify-end">
        <div className="p-3 rounded-lg max-w-[75%] bg-primary text-primary-foreground">
          {/* User messages don't need complex rendering */}
          <p>{message.content}</p>
        </div>
        <Avatar className="h-8 w-8 border">
          <AvatarFallback>
            <User size={16} />
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  // --- Assistant Message Rendering (Badge + Modal) ---
  const tableHtml = convertMarkdownTableToHtml(message.content);

  return (
    <div className="flex items-start space-x-3 py-3 justify-start">
      {/* Avatar with conditional logo */}
      <Avatar className="h-8 w-8 border">
        {agent?.image ? (
          <Image
            src={`/${agent.image}`} // Prepend '/' for public directory
            alt={`${agent.name} logo`}
            width={32} // Match avatar size
            height={32} // Match avatar size
            className="rounded-full" // Ensure image fits the circle
          />
        ) : (
          <AvatarFallback>
            {agentName?.substring(0, 1).toUpperCase() || <Bot size={16} />}
          </AvatarFallback>
        )}
      </Avatar>

      <Dialog>
        <DialogTrigger asChild>
          <button
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity",
              "bg-muted text-muted-foreground" // Badge styling
            )}
            disabled={isLoading} // Disable button while loading
          >
            {agentName}
            {isLoading && <span className="animate-pulse">...</span>}
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[80%] max-h-[80vh] overflow-y-auto"> {/* Adjust size and add scroll */}
          <DialogHeader>
            <DialogTitle>{agentName}</DialogTitle>
          </DialogHeader>
          {/* Content inside the modal */}
          <div className="p-8"> {/* Changed padding to p-8 (32px) */}
            {tableHtml ? (
              // Container for manually rendered table (no prose needed)
              <div dangerouslySetInnerHTML={{ __html: tableHtml }} />
            ) : (
              // Apply CSS module class here, remove prose classes
              <div className={styles.markdownContainer}>
                <ReactMarkdown
                  components={{
                    // Keep code styling if CSS isn't sufficient or for language detection hint
                    code: ({node, inline, className, children, ...props}) => {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline ? (
                        <code className={cn(className, styles.codeBlock)} {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className={cn(className, styles.inlineCode)} {...props}>
                          {children}
                        </code>
                      )
                    },
                    // Ensure links open in new tabs (functionality override)
                    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
