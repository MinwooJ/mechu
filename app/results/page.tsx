import { redirect } from "next/navigation";

import { DEFAULT_LOCALE } from "@/lib/i18n/config";

export const dynamic = "force-static";

export default function LegacyResultsPage() {
  redirect(`/${DEFAULT_LOCALE}/results`);
}
