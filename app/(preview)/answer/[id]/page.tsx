import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Message } from "@/components/message";
import { AnswerSessionCache } from "@/components/answer-session-cache";
import { buildAnswerPresentation } from "@/lib/answer-presentation";
import { getAnswer } from "@/lib/answer-store";
import { renderWidgetResponse } from "@/lib/widget-renderer";

type AnswerPageParams = {
  params: {
    id: string;
  };
};

export async function generateMetadata({ params }: AnswerPageParams): Promise<Metadata> {
  const answer = getAnswer(params.id);

  if (!answer) {
    return {
      title: "Answer not found",
      description: "This answer link may have expired or the data is no longer available.",
      robots: {
        index: false,
      },
    };
  }

  const presentation = buildAnswerPresentation(answer);
  const url = `/answer/${answer.id}`;
  const imageUrl = `${url}/opengraph-image`;

  return {
    title: `${presentation.title} | Generative UI`,
    description: presentation.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: presentation.title,
      description: presentation.description,
      url,
      type: "article",
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      title: presentation.title,
      description: presentation.description,
      images: [imageUrl],
    },
  };
}

export default async function AnswerPage({ params }: AnswerPageParams) {
  const answer = getAnswer(params.id);

  if (!answer) {
    notFound();
  }

  return (
    <div className="flex flex-row justify-center pb-20 min-h-screen bg-background">
      <AnswerSessionCache answer={answer} />
      <div className="flex flex-col w-full">
        <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
          <div className="flex items-start py-3 max-w-[500px] mx-auto w-full md:w-[500px]">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to home
            </Link>
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
