import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Blank project
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ready for your GitHub repo. Connect it and your files will appear here.
        </p>
      </div>
    </main>
  );
}
