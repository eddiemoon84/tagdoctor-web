import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PRESCRIPTIONS } from '@/lib/constants';
import { validateScanUrl } from '@/lib/url-validator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SCAN_API_URL = process.env.SCAN_API_URL || 'http://localhost:3001';

// ─── 동시 스캔 제한 ──────────────────────────────────────────────────────────
const MAX_CONCURRENT_SCANS = 3;
let activeScans = 0;

interface PageInput {
  url: string;
  type?: string;
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

  // 단일 스캔 경로 (하위 호환)
  const url = normalizeUrl(body.url || '');
  if (!url) {
    return NextResponse.json({ error: '올바른 URL을 입력해주세요' }, { status: 400 });
  }

  const validation = await validateScanUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (activeScans >= MAX_CONCURRENT_SCANS) {
    return NextResponse.json(
      { error: '현재 서버가 바쁩니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    );
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

  activeScans++;
  executeScan(data.id, url)
    .catch(console.error)
    .finally(() => { activeScans--; });

  return NextResponse.json({ id: data.id });
}

async function handleMultiScan(pages: PageInput[]) {
  if (pages.length > 5) {
    return NextResponse.json({ error: '최대 5개 페이지까지 진단 가능합니다' }, { status: 400 });
  }

  const normalized: { url: string; type: string }[] = [];
  for (const p of pages) {
    const url = normalizeUrl(p.url || '');
    if (!url) {
      return NextResponse.json({ error: '올바른 URL을 입력해주세요' }, { status: 400 });
    }
    const type = VALID_PAGE_TYPES.has(p.type || '') ? (p.type as string) : 'custom';
    normalized.push({ url, type });
  }

  // SSRF 방어: 모든 URL 검증
  for (const { url } of normalized) {
    const validation = await validateScanUrl(url);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }

  if (activeScans >= MAX_CONCURRENT_SCANS) {
    return NextResponse.json(
      { error: '현재 서버가 바쁩니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    );
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

  activeScans++;
  executeMultiScan(data.id, normalized)
    .catch(console.error)
    .finally(() => { activeScans--; });

  return NextResponse.json({ id: data.id });
}

// ─── 백그라운드 스캔 실행 ─────────────────────────────────────────────────────

interface ScanTag {
  name: string;
  detected: boolean;
  scriptLoadCount: number;
  eventFireCount: number;
  hasEventFire: boolean;
  hasGlobal: boolean;
  isDuplicate: boolean;
  isMultiContainer: boolean;
  ids: string[];
  id: string | null;
  kakaoSdkOnly: boolean;
  status: string;
  detectedEvents?: string[];
  requiredEvents?: { required: string[]; detected: string[]; missing: string[] } | null;
}

interface ScanResult {
  url: string;
  scannedAt: string;
  score: number;
  hosting?: { id: string; name: string };
  summary: { detectedCount: number; totalTags: number; errors: number; warnings: number };
  tags: Record<string, ScanTag>;
}

interface PageScanResult extends ScanResult {
  type: string;
  label?: string;
  error?: string;
}

interface MultiScanResult {
  url: string;
  scannedAt: string;
  hosting: { id: string; name: string };
  overallScore: number;
  pageCount: number;
  pages: PageScanResult[];
}

async function executeScan(scanId: string, url: string) {
  await supabase.from('scan_results').update({ status: 'scanning' }).eq('id', scanId);

  try {
    // 스캔 서버에 HTTP 요청
    const response = await fetch(`${SCAN_API_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(180000),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Scan server returned ${response.status}`);
    }

    const scanResult: ScanResult = await response.json();

    // summary: { meta_pixel: "ok", ga4: "duplicate", ... }
    const summary: Record<string, string> = {};
    const tags = scanResult.tags;
    for (const [key, tag] of Object.entries(tags)) {
      summary[key] = tag.status;
    }

    const hosting = scanResult.hosting || { id: 'general', name: '일반' };

    await updateScanResult(scanId, {
      status: 'completed',
      score: scanResult.score,
      total_trackers: scanResult.summary.totalTags,
      installed_trackers: scanResult.summary.detectedCount,
      summary,
      raw_result: scanResult,
      scanned_at: scanResult.scannedAt,
    }, hosting);

    // tracker_diagnoses 삽입
    const diagnoses = [];
    for (const [key, tag] of Object.entries(tags)) {
      let status = tag.status;
      if (status === 'ok' && !tag.hasEventFire && PRESCRIPTIONS[key]?.no_event) {
        status = 'no_event';
      }

      let prescription: string | null = null;
      if (status === 'not_installed') {
        prescription = tag.kakaoSdkOnly
          ? (PRESCRIPTIONS[key]?.not_installed_sdk_only ?? null)
          : (PRESCRIPTIONS[key]?.not_installed ?? null);
      } else if (status === 'duplicate') {
        prescription = PRESCRIPTIONS[key]?.duplicate ?? null;
      } else if (status === 'multi_container') {
        prescription = PRESCRIPTIONS[key]?.multi_container ?? null;
      } else if (status === 'no_event' || status === 'missing_events' || status === 'partial_events') {
        prescription = PRESCRIPTIONS[key]?.no_event ?? null;
      }

      let trackerScore = 0;
      if (tag.detected) {
        if (tag.isDuplicate) trackerScore = 60;
        else if (tag.isMultiContainer) trackerScore = 90;
        else if (status === 'missing_events') trackerScore = 50;
        else if (status === 'partial_events') trackerScore = 70;
        else if (status === 'no_event') trackerScore = 80;
        else trackerScore = 100;
      }

      diagnoses.push({
        scan_id: scanId,
        tracker_key: key,
        tracker_name: tag.name,
        status,
        script_count: tag.scriptLoadCount,
        event_count: tag.eventFireCount,
        ids: tag.ids || [],
        globals_found: [],
        prescription,
        score: trackerScore,
      });
    }

    const { error: diagInsertError } = await supabase.from('tracker_diagnoses').insert(diagnoses);
    if (diagInsertError) {
      console.error(`tracker_diagnoses insert failed [${scanId}]:`, diagInsertError.message);
      throw new Error(`tracker_diagnoses insert failed: ${diagInsertError.message}`);
    }

  } catch (err) {
    const internal = err instanceof Error ? err.message : String(err);
    console.error(`Scan failed [${scanId}]:`, internal);
    await supabase.from('scan_results').update({
      status: 'failed',
      error_message: '스캔 중 오류가 발생했습니다',
    }).eq('id', scanId);
  }
}

// ─── 멀티 페이지 스캔 실행 ───────────────────────────────────────────────────

async function executeMultiScan(scanId: string, pages: { url: string; type: string }[]) {
  await supabase.from('scan_results').update({ status: 'scanning' }).eq('id', scanId);

  try {
    // 페이지당 90s 타임아웃 + 콜드스타트 여유
    const timeoutMs = Math.min(90000 * pages.length + 60000, 290000);

    const response = await fetch(`${SCAN_API_URL}/api/scan-multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Scan server returned ${response.status}`);
    }

    const result: MultiScanResult = await response.json();

    // 전체 요약: 모든 페이지의 태그 상태를 합침
    const summary: Record<string, string> = {};
    const validPages = result.pages.filter((p) => !p.error);
    if (validPages.length > 0) {
      for (const [key, tag] of Object.entries(validPages[0].tags)) {
        summary[key] = tag.status;
      }
    }

    // 전체 감지 매체 수: 유효한 페이지들 중 하나라도 detected인 트래커 카운트
    const totalTags = Object.keys(validPages[0]?.tags || {}).length;
    const installedTrackers = new Set<string>();
    for (const pg of validPages) {
      for (const [key, tag] of Object.entries(pg.tags)) {
        if (tag.detected) installedTrackers.add(key);
      }
    }

    const hosting = result.hosting || { id: 'general', name: '일반' };

    await updateScanResult(scanId, {
      status: 'completed',
      score: result.overallScore,
      total_trackers: totalTags,
      installed_trackers: installedTrackers.size,
      summary,
      raw_result: result,
      scanned_at: result.scannedAt,
    }, hosting);

  } catch (err) {
    const internal = err instanceof Error ? err.message : String(err);
    console.error(`Multi-scan failed [${scanId}]:`, internal);
    await supabase.from('scan_results').update({
      status: 'failed',
      error_message: '스캔 중 오류가 발생했습니다',
    }).eq('id', scanId);
  }
}

async function updateScanResult(
  scanId: string,
  base: Record<string, unknown>,
  hosting: { id: string; name: string },
) {
  const { error } = await supabase
    .from('scan_results')
    .update({ ...base, hosting_id: hosting.id, hosting_name: hosting.name })
    .eq('id', scanId);
  if (error) throw new Error(`DB update failed: ${error.message}`);
}
