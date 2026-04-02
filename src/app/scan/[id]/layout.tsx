import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  const { data: scan } = await supabase
    .from("scan_results")
    .select("url, score, installed_trackers, total_trackers, status")
    .eq("id", id)
    .single();

  if (!scan || scan.status !== "completed") {
    return { title: "TagDoctor 진단 리포트" };
  }

  const title = `TagDoctor 진단 리포트 - ${scan.url}`;
  const description = `트래킹 건강 점수: ${scan.score}/100 | ${scan.installed_trackers}/${scan.total_trackers}개 매체 감지`;

  return {
    title,
    openGraph: { title, description },
  };
}

export default function ScanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
