import { NextResponse } from 'next/server';
/* eslint-disable @typescript-eslint/no-require-imports */
import { supabase } from '@/lib/supabase';
import { PRESCRIPTIONS } from '@/lib/constants';
import { validateScanUrl } from '@/lib/url-validator';

export const dynamic = 'force-dynamic';

// ─── 동시 스캔 제한 ──────────────────────────────────────────────────────────
const MAX_CONCURRENT_SCANS = 3;
let activeScans = 0;

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  let url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: 'URL을 입력해주세요' }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: '올바른 URL을 입력해주세요' }, { status: 400 });
  }

  // SSRF 방어: private IP / 내부 네트워크 차단
  const validation = await validateScanUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // 동시 스캔 제한
  if (activeScans >= MAX_CONCURRENT_SCANS) {
    return NextResponse.json(
      { error: '현재 서버가 바쁩니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    );
  }

  // DB에 pending 레코드 생성
  const { data, error } = await supabase
    .from('scan_results')
    .insert({ url, status: 'pending' })
    .select('id')
    .single();

  if (error) {
    console.error('DB insert error:', error.message);
    return NextResponse.json({ error: '스캔 요청에 실패했습니다' }, { status: 500 });
  }

  // 백그라운드에서 스캔 실행
  activeScans++;
  executeScan(data.id, url)
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
}

interface ScanResult {
  url: string;
  scannedAt: string;
  score: number;
  summary: { detectedCount: number; totalTags: number; errors: number; warnings: number };
  tags: Record<string, ScanTag>;
}

async function executeScan(scanId: string, url: string) {
  await supabase.from('scan_results').update({ status: 'scanning' }).eq('id', scanId);

  try {
    const scanResult = await runScanEngine(url);

    // summary: { meta_pixel: "ok", ga4: "duplicate", ... }
    const summary: Record<string, string> = {};
    const tags = scanResult.tags as Record<string, ScanTag>;
    for (const [key, tag] of Object.entries(tags)) {
      summary[key] = tag.status;
    }

    await supabase.from('scan_results').update({
      status: 'completed',
      score: scanResult.score,
      total_trackers: scanResult.summary.totalTags,
      installed_trackers: scanResult.summary.detectedCount,
      summary,
      raw_result: scanResult,
      scanned_at: scanResult.scannedAt,
    }).eq('id', scanId);

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
      } else if (status === 'no_event') {
        prescription = PRESCRIPTIONS[key]?.no_event ?? null;
      }

      let trackerScore = 0;
      if (tag.detected) {
        if (tag.isDuplicate) trackerScore = 60;
        else if (tag.isMultiContainer) trackerScore = 90;
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

    await supabase.from('tracker_diagnoses').insert(diagnoses);

  } catch (err) {
    const internal = err instanceof Error ? err.message : String(err);
    console.error(`Scan failed [${scanId}]:`, internal);
    await supabase.from('scan_results').update({
      status: 'failed',
      error_message: '스캔 중 오류가 발생했습니다',
    }).eq('id', scanId);
  }
}

// ─── scan.mjs 실행 ───────────────────────────────────────────────────────────

function runScanEngine(url: string): Promise<ScanResult> {
  // Turbopack 정적 분석 우회 — Node.js 빌트인 모듈은 런타임에만 로드
  const r = eval('require') as NodeRequire;
  const { execFile } = r('child_process') as typeof import('child_process');
  const { readFileSync, unlinkSync } = r('fs') as typeof import('fs');
  const { join } = r('path') as typeof import('path');

  return new Promise((resolve, reject) => {
    const scanDir = process.env.SCAN_ENGINE_PATH;
    if (!scanDir) {
      reject(new Error('SCAN_ENGINE_PATH not configured'));
      return;
    }

    execFile('node', [join(scanDir, 'scan.mjs'), url], {
      timeout: 60000,
      cwd: scanDir,
    }, (error, stdout) => {
      if (error) {
        reject(new Error(`Scan failed: ${error.message}`));
        return;
      }

      const match = stdout.match(/리포트 저장됨: (.+\.json)/);
      if (!match) {
        reject(new Error('Report file not found in scan output'));
        return;
      }

      const reportPath = join(scanDir, match[1].trim());
      try {
        const data = JSON.parse(readFileSync(reportPath, 'utf-8'));
        unlinkSync(reportPath);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });
  });
}
