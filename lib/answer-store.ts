import type { PlanResult, WidgetResponse } from "@/lib/widget-schema";

export type DataMode = "web-search" | "example-data";

export interface StoredAnswerPayload {
  query: string;
  response: WidgetResponse;
  plan: PlanResult | null;
  dataMode?: DataMode;
}

export interface StoredAnswerRecord extends StoredAnswerPayload {
  id: string;
  createdAt: number;
}

type AnswerStore = Map<string, StoredAnswerRecord>;

declare global {
  // eslint-disable-next-line no-var
  var __answerStore: AnswerStore | undefined;
}

function getStore(): AnswerStore {
  if (!globalThis.__answerStore) {
    globalThis.__answerStore = new Map<string, StoredAnswerRecord>();
  }
  return globalThis.__answerStore;
}

export function saveAnswer(answerId: string, payload: StoredAnswerPayload): StoredAnswerRecord {
  const store = getStore();
  const sanitizedPayload: StoredAnswerPayload =
    typeof structuredClone === "function"
      ? structuredClone(payload)
      : (JSON.parse(JSON.stringify(payload)) as StoredAnswerPayload);

  const record: StoredAnswerRecord = {
    ...sanitizedPayload,
    id: answerId,
    createdAt: Date.now(),
  };

  store.set(answerId, record);
  return record;
}

export function getAnswer(answerId: string): StoredAnswerRecord | null {
  const store = getStore();
  return store.get(answerId) ?? null;
}

export function deleteAnswer(answerId: string): boolean {
  const store = getStore();
  return store.delete(answerId);
}

export function hasAnswer(answerId: string): boolean {
  const store = getStore();
  return store.has(answerId);
}

