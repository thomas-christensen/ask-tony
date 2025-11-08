"use client";

import { useRef, useState, useEffect } from "react";
import { Message } from "@/components/message";
import { useScrollToBottom } from "@/components/use-scroll-to-bottom";
import { motion } from "framer-motion";
import { MasonryIcon, VercelIcon, CubeIcon } from "@/components/icons";
import Link from "next/link";
import { ModelSelector } from "@/components/model-selector";
import { DataModeToggle, type DataMode } from "@/components/data-mode-toggle";
import { renderWidgetResponse } from "@/lib/widget-renderer";
import { WidgetResponse } from "@/lib/widget-schema";
import { LoadingState } from "@/lib/loading-states";
import { LoadingIndicator } from "@/components/loading-indicator";
import { ProgressiveSkeleton } from "@/components/progressive-skeleton";
import { generateAnswerId } from "@/lib/answer-utils";
import { sendMessage } from "./actions";

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: WidgetResponse;
  plan?: any; // PlanResult from agent
  query?: string; // Original user query
  dataMode?: 'web-search' | 'example-data';
  answerId?: string; // Unique ID for shareable answer links
}

export default function Home() {
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<Array<MessageItem>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingState, setLoadingState] = useState<LoadingState | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('composer-1');
  const [dataMode, setDataMode] = useState<DataMode>('web-search');
  
  // Progressive skeleton states
  const [planInfo, setPlanInfo] = useState<any>(null);
  const [dataInfo, setDataInfo] = useState<any>(null);
  const [currentQuery, setCurrentQuery] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  // Read model and dataMode from URL parameters on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const modelParam = searchParams.get('model');
    const dataModeParam = searchParams.get('dataMode');
    
    if (modelParam) {
      setSelectedModel(modelParam);
    }
    if (dataModeParam === 'web-search' || dataModeParam === 'example-data') {
      setDataMode(dataModeParam);
    }
  }, []);

  // Load saved messages from sessionStorage on mount
  useEffect(() => {
    try {
      const savedMessages = sessionStorage.getItem('conversation-messages');
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load saved messages:', e);
    }
  }, []);

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem('conversation-messages', JSON.stringify(messages));
      } catch (e) {
        console.warn('Failed to save messages to sessionStorage:', e);
      }
    }
  }, [messages]);


  const suggestedActions = [
    {
      title: "Show me",
      label: "the weather in San Francisco",
      action: "What's the weather in San Francisco?",
    },
    {
      title: "Display",
      label: "Tesla stock price trend",
      action: "Show me Tesla's stock price over the last week",
    },
    {
      title: "Compare",
      label: "iPhone Air vs 17 Pro",
      action: "Compare iPhone Air and iPhone 17 Pro",
    },
    {
      title: "Create",
      label: "the best guacamole recipe",
      action: "Give me the best recipe for guacamole",
    },
  ];

  const handleSubmit = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    setIsLoading(true);
    setLoadingState({ phase: 'analyzing', message: 'Understanding your question', progress: 5, subtext: 'Analyzing intent and requirements' });
    
    // Reset skeleton states
    setPlanInfo(null);
    setDataInfo(null);
    setCurrentQuery(userMessage);

    // Add user message
    setMessages((messages) => [
      ...messages,
      { id: `user-${Date.now()}`, role: "user", content: userMessage },
    ]);
    setInput("");

    try {
      // Use fetch to get streaming updates
      const response = await fetch("/api/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userMessage, model: selectedModel, dataMode }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No reader available");
      }

      // Read the stream
      let finalResponse: WidgetResponse | null = null;
      let capturedPlan: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "progress") {
                // Update loading state with progress, message, and subtext
                setLoadingState(data);
              } else if (data.type === "plan" && data.plan) {
                // Receive plan information for progressive skeleton
                setPlanInfo(data.plan);
                capturedPlan = data.plan; // Capture for message storage
              } else if (data.type === "data" && data.dataResult) {
                // Receive data information for progressive skeleton
                setDataInfo(data.dataResult);
              } else if (data.type === "complete" && data.response) {
                // Store final response
                finalResponse = data.response;
              } else if (data.type === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              // Skip invalid JSON lines
              console.warn("Failed to parse SSE data:", e);
            }
          }
        }
      }

      // Add final response to messages with plan and query for live updates
      if (finalResponse) {
        const answerId = generateAnswerId();
        
        // Persist to sessionStorage for shareable links
        try {
          sessionStorage.setItem(answerId, JSON.stringify({
            query: userMessage,
            response: finalResponse,
            plan: capturedPlan,
            dataMode: dataMode
          }));
        } catch (e) {
          console.warn('Failed to persist answer to sessionStorage:', e);
        }
        
        setMessages((messages) => [
          ...messages,
          { 
            id: `assistant-${Date.now()}`, 
            role: "assistant", 
            content: "", 
            response: finalResponse,
            plan: capturedPlan,
            query: userMessage,
            dataMode: dataMode,
            answerId: answerId
          },
        ]);
      } else {
        throw new Error("No response received");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((messages) => [
        ...messages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: "",
          response: {
            textResponse: "Sorry, something went wrong. Please try again.",
            error: true
          },
        },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingState(null);
      setPlanInfo(null);
      setDataInfo(null);
    }
  };

  return (    
    <div className="flex flex-row justify-center pb-20 h-dvh bg-background">
      <div className="flex flex-col justify-between">
        
        <div
          ref={messagesContainerRef}        
          className="flex flex-col gap-2 h-full w-dvw items-center overflow-y-scroll pt-16"
        >
          {messages.map((message, index) => {
            // Check if this is an assistant message followed by a user message (end of group)
            const isEndOfGroup = 
              message.role === "assistant" && 
              index < messages.length - 1 && 
              messages[index + 1].role === "user";
            
            return (
              <motion.div 
                key={message.id} 
                className={isEndOfGroup ? "mb-4" : ""}
              >
                <Message
                  role={message.role}
                  content={
                    message.response
                      ? renderWidgetResponse(message.response, message.plan, message.query, message.dataMode)
                      : message.content
                  }
                  answerId={message.answerId}
                />
              </motion.div>
            );
          })}
          {/* Show loading indicator (cube + shimmer text) and skeleton while loading */}
          {isLoading && loadingState && (
            <>
              {/* Original shimmer indicator at top */}
              <LoadingIndicator loadingState={loadingState} />
              
              {/* Progressive skeleton below - only show during component creation phases */}
              {(loadingState.phase === 'designing' || 
                loadingState.phase === 'generating' || 
                loadingState.phase === 'validating' || 
                loadingState.phase === 'reviewing') && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-row gap-2 px-4 md:px-0 w-full md:w-[500px] first-of-type:pt-20"
                >
                  {/* Icon spacer to match Message layout */}
                  <div className="size-[24px] flex-shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <ProgressiveSkeleton
                      stage={
                        loadingState.phase === 'designing' ? 1 :
                        planInfo && !dataInfo ? 2 :
                        dataInfo ? 3 : 1
                      }
                      plan={planInfo}
                      dataResult={dataInfo}
                      userQuery={currentQuery}
                    />
                  </div>
                </motion.div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="grid sm:grid-cols-2 gap-2 w-full px-4 md:px-0 mx-auto md:max-w-[500px] mb-4">
          {messages.length === 0 &&
            !isLoading &&
            suggestedActions.map((action, index) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.01 * index }}
                key={index}
                className={index > 1 ? "hidden sm:block" : "block"}
              >
                <button
                  onClick={() => handleSubmit(action.action)}
                  disabled={isLoading}
                  className="w-full text-left bg-muted/20 hover:bg-muted/40 text-foreground rounded-lg p-2 text-sm transition-colors flex flex-col disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-medium">{action.title}</span>
                  <span className="text-muted-foreground">
                    {action.label}
                  </span>
                </button>
              </motion.div>
            ))}
        </div>

        <form
          className="flex flex-col gap-2 relative items-center w-full"
          onSubmit={async (event) => {
            event.preventDefault();
            handleSubmit(input);
          }}
        >
          <div 
            className={`
              flex flex-col w-full md:max-w-[500px] max-w-[calc(100dvw-32px)]
              border rounded-lg transition-all duration-200 cursor-text
              ${isFocused 
                ? 'bg-white dark:bg-[#2A2A2A] border-border' 
                : 'bg-background border-border'
              }
            `}
            onClick={() => inputRef.current?.focus()}
          >
            {/* Input Field */}
            <input
              ref={inputRef}
              className="bg-transparent px-3 pt-3 pb-2 w-full outline-none text-foreground placeholder-muted-foreground disabled:opacity-50"
              placeholder="Ask, search, build anything"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isLoading}
            />
            
            {/* Model Selector, Data Mode Toggle, and Submit Button Row */}
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <ModelSelector 
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  disabled={isLoading}
                />
                <DataModeToggle
                  dataMode={dataMode}
                  onDataModeChange={setDataMode}
                  disabled={isLoading}
                />
              </div>
              
              <div className="flex items-center gap-1.5 sm:gap-2">                
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shrink-0"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
