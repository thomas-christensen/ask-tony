"use client";

import { useEffect } from "react";
import type { StoredAnswerRecord } from "@/lib/answer-store";

export function AnswerSessionCache({ answer }: { answer: StoredAnswerRecord }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(answer.id, JSON.stringify(answer));
    } catch (error) {
      console.warn("Failed to cache answer in sessionStorage:", error);
    }
  }, [answer]);

  return null;
}

