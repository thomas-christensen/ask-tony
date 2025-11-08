import Link from "next/link";

export default function AnswerNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="text-center max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-foreground">Answer not found</h1>
        <p className="text-muted-foreground">
          This answer link may have expired or the data is no longer available.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Go back home
        </Link>
      </div>
    </div>
  );
}

