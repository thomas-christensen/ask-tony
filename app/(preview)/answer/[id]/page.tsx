"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Message } from "@/components/message";
import { renderWidgetResponse } from "@/lib/widget-renderer";
import type { StoredAnswerRecord } from "@/lib/answer-store";
import { motion } from "framer-motion";
import Link from "next/link";

export default function AnswerPage() {
  const params = useParams();
  const router = useRouter();
  const answerId = params.id as string;
  const [answerData, setAnswerData] = useState<StoredAnswerRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!answerId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;
    let hasSessionRecord = false;

    const loadFromSessionStorage = () => {
      try {
        const cached = sessionStorage.getItem(answerId);
        if (!cached) return;

        const parsed = JSON.parse(cached) as Partial<StoredAnswerRecord>;

        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.query === "string" &&
          parsed.response &&
          typeof parsed.response === "object"
        ) {
          const normalized: StoredAnswerRecord = {
            id: typeof parsed.id === "string" ? parsed.id : answerId,
            query: parsed.query,
            response: parsed.response as StoredAnswerRecord["response"],
            plan:
              parsed.plan !== undefined && parsed.plan !== null
                ? (parsed.plan as StoredAnswerRecord["plan"])
                : null,
            ...(parsed.dataMode === "web-search" || parsed.dataMode === "example-data"
              ? { dataMode: parsed.dataMode }
              : {}),
            createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
          };

          hasSessionRecord = true;

          if (!cancelled) {
            setAnswerData(normalized);
            setNotFound(false);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.warn("Failed to read cached answer from sessionStorage:", error);
      }
    };

    loadFromSessionStorage();

    async function fetchAnswer() {
      if (!hasSessionRecord && !cancelled) {
        setIsLoading(true);
        setNotFound(false);
      }

      try {
        const response = await fetch(`/api/answers/${answerId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) {
              if (!hasSessionRecord) {
                setNotFound(true);
                setAnswerData(null);
              } else {
                setNotFound(false);
              }
            }
            try {
              sessionStorage.removeItem(answerId);
            } catch (storageError) {
              console.warn("Failed to remove cached answer from sessionStorage:", storageError);
            }
            return;
          }
          throw new Error(`Failed to load answer (${response.status})`);
        }

        const data = (await response.json()) as { answer: StoredAnswerRecord };

        if (!cancelled) {
          setAnswerData(data.answer);
          setNotFound(false);
          setIsLoading(false);
        }

        try {
          sessionStorage.setItem(answerId, JSON.stringify(data.answer));
        } catch (storageError) {
          console.warn("Failed to cache answer in sessionStorage:", storageError);
        }
      } catch (error) {
        console.error("Failed to retrieve answer data:", error);
        if (!cancelled && !hasSessionRecord) {
          setNotFound(true);
          setAnswerData(null);
        }
      } finally {
        if (!cancelled && !hasSessionRecord) {
          setIsLoading(false);
        }
      }
    }

    fetchAnswer();

    return () => {
      cancelled = true;
    };
  }, [answerId]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Answer not found
          </h1>
          <p className="text-muted-foreground mb-6">
            This answer link may have expired or the data is no longer available.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go back home
          </Link>
        </motion.div>
      </div>
    );
  }

  if (isLoading || !answerData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-row justify-center pb-20 min-h-screen bg-background">
      <div className="flex flex-col w-full">
        {/* Header with back button */}
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-start py-3 max-w-[500px] mx-auto w-full md:w-[500px]">
            <button
              onClick={() => router.back()}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-2 items-center pt-16 px-4">
          {/* User Question */}
          <Message
            role="user"
            content={answerData.query}
          />

          {/* Assistant Answer */}
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Message
              role="assistant"
              content={renderWidgetResponse(
                answerData.response,
                answerData.plan,
                answerData.query,
                answerData.dataMode
              )}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

