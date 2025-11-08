"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Message } from "@/components/message";
import { renderWidgetResponse } from "@/lib/widget-renderer";
import { WidgetResponse } from "@/lib/widget-schema";
import { motion } from "framer-motion";
import Link from "next/link";

interface AnswerData {
  query: string;
  response: WidgetResponse;
  plan?: any;
  dataMode?: 'web-search' | 'example-data';
}

export default function AnswerPage() {
  const params = useParams();
  const router = useRouter();
  const answerId = params.id as string;
  const [answerData, setAnswerData] = useState<AnswerData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!answerId) return;

    try {
      const stored = sessionStorage.getItem(answerId);
      if (stored) {
        const data = JSON.parse(stored) as AnswerData;
        setAnswerData(data);
      } else {
        setNotFound(true);
      }
    } catch (e) {
      console.error('Failed to retrieve answer data:', e);
      setNotFound(true);
    }
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
            This answer link may have expired or the session data is no longer available.
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

  if (!answerData) {
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

