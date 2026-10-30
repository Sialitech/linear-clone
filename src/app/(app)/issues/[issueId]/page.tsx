import IssueDetail from "@/components/issue-detail";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ issueId: string }>;
}) {
  const { issueId } = await params;
  return <IssueDetail issueId={issueId} />;
}
