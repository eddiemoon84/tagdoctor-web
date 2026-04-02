import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // UUID 형식 검증
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  // raw_result 제외 — 내부 데이터 노출 방지
  const { data: scan, error } = await supabase
    .from('scan_results')
    .select('id, url, status, score, total_trackers, installed_trackers, summary, error_message, scanned_at, created_at')
    .eq('id', id)
    .single();

  if (error || !scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  // completed인 경우 tracker_diagnoses도 함께 조회
  let diagnoses = null;
  if (scan.status === 'completed') {
    const { data } = await supabase
      .from('tracker_diagnoses')
      .select('*')
      .eq('scan_id', id)
      .order('created_at');
    diagnoses = data;
  }

  return NextResponse.json({
    ...scan,
    tracker_diagnoses: diagnoses || [],
  });
}
