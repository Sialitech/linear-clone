import SavedViewScreen from "@/components/views-screen";

export default async function ViewPage({
  params,
}: {
  params: Promise<{ viewId: string }>;
}) {
  const { viewId } = await params;
  return <SavedViewScreen viewId={viewId} />;
}
