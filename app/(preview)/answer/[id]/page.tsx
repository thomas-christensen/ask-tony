"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CubeIcon } from "@/components/icons";
import { Message } from "@/components/message";
import { AnswerSessionCache } from "@/components/answer-session-cache";
import { getAnswer } from "@/lib/answer-store";
import { renderWidgetResponse } from "@/lib/widget-renderer";

type AnswerPageParams = {
  params: {
    id: string;
  };
};

export default function AnswerPage({ params }: AnswerPageParams) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const answer = getAnswer(params.id);

  if (!answer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Answer not found</p>
      </div>
    );
  }

  const handleBackClick = () => {
    setIsNavigating(true);
    router.push("/");
  };

  return (
    <div className="flex flex-row justify-center pb-20 min-h-screen bg-background">
      <AnswerSessionCache answer={answer} />
      
      {/* Loading overlay */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="flex flex-row gap-2 items-center"
              initial={{ y: 5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-muted-foreground"
              >
                <CubeIcon />
              </motion.div>
              <div className="text-base text-muted-foreground animate-shimmer-text">
                Loading home...
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col w-full">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-start py-3 max-w-[500px] mx-auto w-full md:w-[500px]">
            <button
              onClick={handleBackClick}
              disabled={isNavigating}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1 hover:underline disabled:opacity-50 disabled:cursor-not-allowed bg-transparent border-0 p-0 font-inherit"
            >
              ← Back to home
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 items-center pt-16 px-4">
          <Message role="user" content={answer.query} />
          <Message
            role="assistant"
            answerId={answer.id}
            content={renderWidgetResponse(
              answer.response,
              answer.plan,
              answer.query,
              answer.dataMode
            )}
          />
        </div>
      </div>
    </div>
  );
}
