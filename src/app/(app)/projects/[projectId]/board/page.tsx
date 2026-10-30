import ProjectScreen from "@/components/project-screen";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectScreen projectId={projectId} mode="board" />;
}
