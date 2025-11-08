"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CubeIcon } from "./icons";
import { LoadingState } from "@/lib/loading-states";

interface LoadingIndicatorProps {
  loadingState: LoadingState;
  agentEvents?: Array<{ message: string; timestamp: number }>;
}

export function LoadingIndicator({ loadingState, agentEvents = [] }: LoadingIndicatorProps) {
  // Get the most recent agent event or fall back to the main loading message
  const latestEvent = agentEvents.length > 0 ? agentEvents[agentEvents.length - 1] : null;
  const displayMessage = latestEvent ? latestEvent.message : loadingState.message;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        className="flex flex-row gap-2 px-4 w-full md:w-[500px] md:px-0"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="size-[24px] flex flex-col justify-center items-center flex-shrink-0 text-muted-foreground">
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <CubeIcon />
          </motion.div>
        </div>

        <div className="flex flex-col gap-1 w-full">
          {/* Main message with gradient shimmer text - updates with latest agent event */}
          <AnimatePresence mode="wait">
            <motion.div
              key={displayMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-base animate-shimmer-text"
            >
              {displayMessage}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

