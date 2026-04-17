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

  const { data: scan, error } = await supabase
    .from('scan_results')
    .select('id, url, status, score, total_trackers, installed_trackers, summary, raw_result, error_message, scanned_at, created_at')
    .eq('id', id)
    .single();

  if (error || !scan) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  // 멀티 스캔 여부 — raw_result.pages 존재로 판단
  const isMulti = Array.isArray(scan.raw_result?.pages);

  // 단일 스캔만 tracker_diagnoses 조회 (멀티는 raw_result.pages에 내장)
  let diagnoses = null;
  if (scan.status === 'completed' && !isMulti) {
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
    is_multi: isMulti,
  });
}
