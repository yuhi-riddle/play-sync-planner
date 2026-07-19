import { redirect } from "next/navigation";

import { ConnectionList } from "@/components/connection-list";
import { ReceivedEventInvitations } from "@/components/received-event-invitations";
import { SetupPanel } from "@/components/state-panels";
import { PageHeader } from "@/components/ui";
import { loadConnectionsPageData, type ConnectionsPageRpcClient } from "@/lib/connections/page-data";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { connectionCategorySchema, type ConnectionCategory } from "@/lib/validation/request";

export const dynamic = "force-dynamic";

type SearchParams = { category?: string | string[] };

function selectedCategory(searchParams: SearchParams): ConnectionCategory {
  const value = typeof searchParams.category === "string" ? searchParams.category : null;
  const parsed = connectionCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : "favorites";
}

export default async function ConnectionsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Connections" title="つながり" />
        <SetupPanel />
      </div>
    );
  }

  const [params, supabase] = await Promise.all([searchParams ?? Promise.resolve({}), createSupabaseServerClient()]);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fconnections");

  const category = selectedCategory(params);
  const pageData = await loadConnectionsPageData(supabase as unknown as ConnectionsPageRpcClient, category);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Connections" title="つながり" description="一緒にイベントへ参加した人を、次の予定へ招待できます。" />
      <ReceivedEventInvitations invitations={pageData.invitations} />
      <ConnectionList
        initialCategory={category}
        initialItems={pageData.items}
        initialNextCursor={pageData.nextCursor}
        initialError={pageData.connectionError}
        counts={pageData.counts}
      />
    </div>
  );
}
