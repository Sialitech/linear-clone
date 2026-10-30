"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <h1 className="text-sm font-medium">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 text-sm text-foreground underline-offset-4 hover:underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
