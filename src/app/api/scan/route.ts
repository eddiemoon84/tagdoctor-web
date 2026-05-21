import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateScanUrl } from '@/lib/url-validator';

export const dynamic = 'force-dynamic';

const SCAN_API_URL = process.env.SCAN_API_URL || 'http://localhost:3001';

interface PageInput {
  url: string;
  type?: string;
  label?: string;
}

const VALID_PAGE_TYPES = new Set(['home', 'product', 'cart', 'checkout', 'thankyou', 'custom']);

function normalizeUrl(raw: string): string | null {
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

// Render의 /api/scan-async를 트리거하고 202 ack까지만 기다림.
// Render는 즉시 202 응답 후 백그라운드로 스캔 + Supabase 업데이트.
// Render 콜드스타트(약 50초) 대비 55초 타임아웃 — Hobby plan 60초 한도 내.
async function triggerRenderScan(payload: object): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${SCAN_API_URL}/api/scan-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      return { ok: false, error: errBody.error || `Scan server returned ${r.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function markPendingFailed(scanId: string) {
  await supabase.from('scan_results').update({
    status: 'failed',
    error_message: '스캔 요청에 실패했습니다',
  }).eq('id', scanId);
}

export async function POST(request: Request) {
  let body: { url?: string; pages?: PageInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  // 멀티 스캔 경로
  if (Array.isArray(body.pages) && body.pages.length > 0) {
    return handleMultiScan(body.pages);
  }

  // 단일 스캔 경로
  const url = normalizeUrl(body.url || '');
  if (!url) {
    return NextResponse.json({ error: '올바른 URL을 입력해주세요' }, { status: 400 });
  }

  const validation = await validateScanUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('scan_results')
    .insert({ url, status: 'pending' })
    .select('id')
    .single();

  if (error) {
    console.error('DB insert error:', error.message);
    return NextResponse.json({ error: '스캔 요청에 실패했습니다' }, { status: 500 });
  }

  const result = await triggerRenderScan({ scanId: data.id, url });
  if (!result.ok) {
    console.error(`Trigger scan failed [${data.id}]:`, result.error);
    await markPendingFailed(data.id);
    return NextResponse.json({ error: '스캔 요청에 실패했습니다' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

async function handleMultiScan(pages: PageInput[]) {
  if (pages.length > 5) {
    return NextResponse.json({ error: '최대 5개 페이지까지 진단 가능합니다' }, { status: 400 });
  }

  const normalized: { url: string; type: string; label?: string }[] = [];
  for (const p of pages) {
    const url = normalizeUrl(p.url || '');
    if (!url) {
      return NextResponse.json({ error: '올바른 URL을 입력해주세요' }, { status: 400 });
    }
    const type = VALID_PAGE_TYPES.has(p.type || '') ? (p.type as string) : 'custom';
    normalized.push({ url, type, label: p.label });
  }

  // SSRF 방어: 모든 URL 검증
  for (const { url } of normalized) {
    const validation = await validateScanUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }

  const mainUrl = normalized[0].url;
  const { data, error } = await supabase
    .from('scan_results')
    .insert({ url: mainUrl, status: 'pending' })
    .select('id')
    .single();

  if (error) {
    console.error('DB insert error:', error.message);
    return NextResponse.json({ error: '스캔 요청에 실패했습니다' }, { status: 500 });
  }

  const result = await triggerRenderScan({ scanId: data.id, pages: normalized });
  if (!result.ok) {
    console.error(`Trigger multi-scan failed [${data.id}]:`, result.error);
    await markPendingFailed(data.id);
    return NextResponse.json({ error: '스캔 요청에 실패했습니다' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
