"use client"; // Required for useState and event handlers

import { useState, useEffect, useRef, useCallback } from "react"; // Added useCallback
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Loader2, Table } from "lucide-react";
import { agents } from "@/lib/agents";
import { Message } from "@/lib/types/Message";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/components/ChatMessage";

// Typing effect configuration
const TYPING_INTERVAL_MS = 30; // Milliseconds between character updates
const CHARS_PER_INTERVAL = 2; // How many characters to add each interval

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(
    agents.slice(0, 3).map((a) => a.id)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showCompareButton, setShowCompareButton] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [activeStreams, setActiveStreams] = useState<Set<string>>(new Set());
  const [streamingTargets, setStreamingTargets] = useState<
    Record<string, string>
  >({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      const scrollViewport = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }, 0);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const typeChars = () => {
      setMessages((currentMessages) => {
        let messagesChanged = false;
        const nextMessages = currentMessages.map((msg) => {
          const targetKey = `${msg.agentId}-${msg.agentName}`;
          const targetContent = streamingTargets[targetKey];

          if (
            msg.isLoading &&
            targetContent &&
            msg.content.length < targetContent.length
          ) {
            const charsToAdd = Math.min(
              CHARS_PER_INTERVAL,
              targetContent.length - msg.content.length
            );
            messagesChanged = true;
            return {
              ...msg,
              content:
                msg.content +
                targetContent.substring(
                  msg.content.length,
                  msg.content.length + charsToAdd
                ),
            };
          }
          return msg;
        });

        if (messagesChanged) {
          return nextMessages;
        }
        return currentMessages;
      });
    };

    if (Object.keys(streamingTargets).length > 0 && !intervalRef.current) {
      intervalRef.current = setInterval(typeChars, TYPING_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [streamingTargets]);

  const updateTargetContent = useCallback(
    (
      targetKey: string,
      chunk: string | null,
      isFinished: boolean = false,
      isError: boolean = false
    ) => {
      setStreamingTargets((prevTargets) => {
        const newTargets = { ...prevTargets };
        if (isFinished || isError) {
          delete newTargets[targetKey];
        } else if (chunk) {
          newTargets[targetKey] = (newTargets[targetKey] || "") + chunk;
        }
        return newTargets;
      });
    },
    []
  );

  const handleSendMessage = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (
      !input.trim() ||
      selectedAgentIds.length === 0 ||
      isLoading ||
      isComparing
    )
      return;

    const userMessage: Message = { role: "user", content: input };
    const currentInput = input;
    setInput("");
    setIsLoading(true);
    setShowCompareButton(false);

    setMessages((prev) => [...prev, userMessage]);
    const currentHistory = [...messages, userMessage].filter(
      (msg) => msg.role !== "separator"
    );

    const newActiveStreams = new Set<string>();
    const placeholderMessages: Message[] = selectedAgentIds.map((id) => {
      const agent = agents.find((a) => a.id === id);
      const agentName = agent?.name || id;
      const targetKey = `${id}-${agentName}`;
      newActiveStreams.add(id);
      setStreamingTargets((prev) => ({ ...prev, [targetKey]: "" }));
      return {
        role: "assistant",
        agentId: id,
        agentName,
        content: "",
        isLoading: true,
      };
    });
    setMessages((prev) => [...prev, ...placeholderMessages]);
    setActiveStreams(newActiveStreams);

    selectedAgentIds.forEach(async (agentId) => {
      const agent = agents.find((a) => a.id === agentId);
      const agentName = agent?.name || agentId;
      const targetKey = `${agentId}-${agentName}`;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: currentHistory,
            agentId: agentId,
          }),
        });

        if (!response.ok || !response.body) {
          const errorData = response.ok
            ? { error: "Response body is null" }
            : await response.json();
          throw new Error(
            errorData.error || `API request failed for ${agentId}`
          );
        }

        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = "";
        let finalContent = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim() === "") continue;
            try {
              const parsed = JSON.parse(line);
              const { type, content, error } = parsed;

              if (type === "chunk" && content) {
                finalContent += content;
                updateTargetContent(targetKey, content);
              } else if (type === "end") {
                updateTargetContent(targetKey, null, true);
                setActiveStreams((prev) => {
                  const next = new Set(prev);
                  next.delete(agentId);
                  return next;
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.agentId === agentId && m.agentName === agentName
                      ? { ...m, content: finalContent, isLoading: false }
                      : m
                  )
                );
              } else if (type === "error") {
                updateTargetContent(targetKey, null, false, true);
                setActiveStreams((prev) => {
                  const next = new Set(prev);
                  next.delete(agentId);
                  return next;
                });
                setMessages((prev) =>
                  prev.map((m) =>
                    m.agentId === agentId && m.agentName === agentName
                      ? {
                          ...m,
                          content: `Error: ${error}\n\n${finalContent}`,
                          isLoading: false,
                          agentName: `${agentName} (Error)`,
                        }
                      : m
                  )
                );
              }
            } catch (e) {
              console.error("Failed to parse stream chunk:", line, e);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to get or process stream for ${agentId}:`, error);
        updateTargetContent(targetKey, null, false, true);
        setActiveStreams((prev) => {
          const next = new Set(prev);
          next.delete(agentId);
          return next;
        });
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.agentId === agentId && msg.isLoading) {
              return {
                ...msg,
                content: `Failed to get response: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
                isLoading: false,
                agentName: `${msg.agentName} (Error)`,
              };
            }
            return msg;
          })
        );
      }
    });
  };

  useEffect(() => {
    if (!isComparing && activeStreams.size === 0) {
      setIsLoading(false);

      const lastUserMessageIndex = messages.findLastIndex(
        (m) => m.role === "user"
      );
      if (lastUserMessageIndex !== -1) {
        const subsequentMessages = messages.slice(lastUserMessageIndex + 1);
        const successfulAssistantResponses = subsequentMessages.filter(
          (m) =>
            m.role === "assistant" &&
            !m.isLoading &&
            !m.agentName?.includes("(Error)") &&
            !m.agentName?.includes("(Analysis)")
        );
        if (successfulAssistantResponses.length > 1) {
          const firstResponseIndex = messages.findIndex(
            (m) => m === successfulAssistantResponses[0]
          );
          if (firstResponseIndex === lastUserMessageIndex + 1) {
            setShowCompareButton(true);
          } else {
            setShowCompareButton(false);
          }
        } else {
          setShowCompareButton(false);
        }
      } else {
        setShowCompareButton(false);
      }
    } else {
      setShowCompareButton(false);
    }
  }, [activeStreams, isComparing, messages]);

  const handleCompareClick = async () => {
    console.log("Compare Arguments button clicked");
    setIsComparing(true);
    setShowCompareButton(false);

    const lastUserMessageIndex = messages.findLastIndex(
      (m) => m.role === "user"
    );
    if (lastUserMessageIndex === -1) {
      console.error("Could not find the last user message to compare.");
      setIsComparing(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          agentName: "System Error",
          content: "Cannot perform comparison: Previous user query not found.",
        },
      ]);
      return;
    }

    const userQuery = messages[lastUserMessageIndex];
    const assistantResponses = messages
      .slice(lastUserMessageIndex + 1)
      .filter(
        (m) =>
          m.role === "assistant" &&
          !m.agentName?.includes("(Analysis)") &&
          !m.agentName?.includes("(Error)")
      );

    if (assistantResponses.length < 2) {
      console.warn("Need at least two assistant responses to compare.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          agentName: "System",
          content:
            "At least two arguments are needed from the last turn to compare.",
        },
      ]);
      setIsComparing(false);
      return;
    }

    try {
      const agentIdsBeingCompared = [
        ...new Set(assistantResponses.map((r) => r.agentId).filter(Boolean)),
      ] as string[];
      const summarizerAgent = agents.find((a) => a.id === "summarizer");

      const separatorMessage: Message = {
        role: "separator",
        content: "-- Comparison Analysis --",
        agentId: "separator-1",
        agentName: "Separator",
      };

      const placeholderMessages: Message[] = agentIdsBeingCompared.map((id) => {
        const agent = agents.find((a) => a.id === id);
        const agentName = `${agent?.name || id} (Analysis)`;
        const targetKey = `${id}-${agentName}`;
        setStreamingTargets((prev) => ({ ...prev, [targetKey]: "" }));
        return {
          role: "assistant",
          agentId: id,
          agentName,
          content: "",
          isLoading: true,
        };
      });

      if (summarizerAgent) {
        const agentName = `${summarizerAgent.name} (Table)`;
        const targetKey = `${summarizerAgent.id}-${agentName}`;
        setStreamingTargets((prev) => ({ ...prev, [targetKey]: "" }));
        placeholderMessages.push({
          role: "assistant",
          agentId: summarizerAgent.id,
          agentName,
          content: "",
          isLoading: true,
        });
      }

      setMessages((prev) => [
        ...prev,
        separatorMessage,
        ...placeholderMessages,
      ]);

      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userQuery, assistantResponses }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `API request failed with status ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let buffer = "";
      const finalContents: Record<string, string> = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const parsed = JSON.parse(line);
            const { type, agentId, agentName, content, error } = parsed;
            const targetKey = `${agentId}-${agentName}`;

            if (!finalContents[targetKey]) finalContents[targetKey] = "";

            if (type === "chunk" && content) {
              finalContents[targetKey] += content;
              updateTargetContent(targetKey, content);
            } else if (type === "end") {
              updateTargetContent(targetKey, null, true);
              setMessages((prev) =>
                prev.map((m) =>
                  m.agentId === agentId && m.agentName === agentName
                    ? {
                        ...m,
                        content: finalContents[targetKey],
                        isLoading: false,
                      }
                    : m
                )
              );
            } else if (type === "error") {
              updateTargetContent(targetKey, null, false, true);
              const errorAgentName = `${
                agentName?.replace(/ \((Analysis|Table)\)$/, "") || agentId
              } (Error)`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.agentId === agentId && m.agentName === agentName
                    ? {
                        ...m,
                        content: `Error: ${error}\n\n${finalContents[targetKey]}`,
                        isLoading: false,
                        agentName: errorAgentName,
                      }
                    : m
                )
              );
            }
          } catch (e) {
            console.error("Failed to parse stream chunk:", line, e);
          }
        }
      }
    } catch (error) {
      console.error("Failed to get or process comparison stream:", error);
      setStreamingTargets((prevTargets) => {
        const nextTargets = { ...prevTargets };
        messages.forEach((msg) => {
          if (
            msg.isLoading &&
            (msg.agentName?.includes("(Analysis)") ||
              msg.agentName?.includes("(Table)"))
          ) {
            delete nextTargets[`${msg.agentId}-${msg.agentName}`];
          }
        });
        return nextTargets;
      });
    } finally {
      setIsComparing(false);
      setStreamingTargets((prevTargets) => {
        const nextTargets = { ...prevTargets };
        messages.forEach((msg) => {
          if (
            msg.agentName?.includes("(Analysis)") ||
            msg.agentName?.includes("(Table)")
          ) {
            delete nextTargets[`${msg.agentId}-${msg.agentName}`];
          }
        });
        setMessages((prev) =>
          prev.map((msg) =>
            msg.agentName?.includes("(Analysis)") ||
            msg.agentName?.includes("(Table)")
              ? { ...msg, isLoading: false }
              : msg
          )
        );
        return nextTargets;
      });
    }
  };

  const handleAgentSelection = (agentId: string, checked: boolean) => {
    setSelectedAgentIds((prev) =>
      checked ? [...prev, agentId] : prev.filter((id) => id !== agentId)
    );
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 lg:p-12 bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-3xl shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Argumind</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isLoading}>
                Select Agents
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Available Agents</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(() => {
                const displayableAgents = agents.filter(
                  (agent) => agent.id !== "summarizer"
                );
                const recommendedAgents = displayableAgents.slice(0, 3);
                const otherAgents = displayableAgents.slice(3);

                return (
                  <>
                    {recommendedAgents.length > 0 && (
                      <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                          Recommended Agents
                        </DropdownMenuLabel>
                        {recommendedAgents.map((agent) => (
                          <DropdownMenuCheckboxItem
                            key={agent.id}
                            checked={selectedAgentIds.includes(agent.id)}
                            onCheckedChange={(checked) =>
                              handleAgentSelection(agent.id, !!checked)
                            }
                          >
                            {agent.name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </>
                    )}
                    {otherAgents.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">
                          Other Agents
                        </DropdownMenuLabel>
                        {otherAgents.map((agent) => (
                          <DropdownMenuCheckboxItem
                            key={agent.id}
                            checked={selectedAgentIds.includes(agent.id)}
                            onCheckedChange={(checked) =>
                              handleAgentSelection(agent.id, !!checked)
                            }
                          >
                            {agent.name}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] w-full pr-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message, index) =>
                message.role === "separator" ? (
                  <div
                    key={index}
                    className="text-center text-xs text-muted-foreground py-2 my-2 border-t border-b"
                  >
                    {message.content}
                  </div>
                ) : (
                  <ChatMessage key={index} message={message} />
                )
              )}
              {(isLoading || isComparing) &&
                Object.keys(streamingTargets).length > 0 && (
                  <div className="flex justify-start items-center space-x-2 py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                    <span className="text-gray-500 dark:text-gray-400">
                      {isComparing
                        ? "Comparing & Summarizing..."
                        : `Generating responses...`}
                    </span>
                  </div>
                )}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="flex-col items-stretch">
          {showCompareButton && (
            <div className="flex justify-center mb-2">
              <Button
                variant="secondary"
                onClick={handleCompareClick}
                disabled={isComparing || isLoading}
              >
                {isComparing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isComparing ? "Comparing..." : "Compare Arguments"}
              </Button>
            </div>
          )}
          <form
            onSubmit={handleSendMessage}
            className="flex w-full items-center space-x-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={
                isLoading || isComparing || selectedAgentIds.length === 0
              }
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={
                isLoading ||
                isComparing ||
                !input.trim() ||
                selectedAgentIds.length === 0
              }
            >
              {isLoading
                ? "Generating..."
                : isComparing
                ? "Comparing..."
                : "Send"}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
