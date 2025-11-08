import type { Metadata } from "next";
import { getAnswer } from "@/lib/answer-store";
import { buildAnswerPresentation } from "@/lib/answer-presentation";

type AnswerLayoutParams = {
  params: {
    id: string;
  };
  children: React.ReactNode;
};

export async function generateMetadata({ params }: AnswerLayoutParams): Promise<Metadata> {
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

export default function AnswerLayout({ children }: AnswerLayoutParams) {
  return <>{children}</>;
}

