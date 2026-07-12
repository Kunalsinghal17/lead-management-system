import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="text-sm font-medium text-muted-foreground">Preview is working</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Blank project ready
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
          This clean starter is ready for you to connect a GitHub repo and bring in your files.
        </p>
      </div>
    </main>
  );
}
