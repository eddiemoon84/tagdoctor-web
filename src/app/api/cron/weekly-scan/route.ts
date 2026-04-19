import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { diffSummary, sendChangeEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SCAN_API_URL = process.env.SCAN_API_URL || 'http://localhost:3001';

interface ScanTag {
  status: string;
}
interface ScanResponse {
  url: string;
  scannedAt: string;
  score: number;
  summary: { detectedCount: number; totalTags: number; errors: number; warnings: number };
  tags: Record<string, ScanTag>;
  hosting?: { id: string; name: string };
}

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  // Vercel Cron은 Authorization: Bearer <CRON_SECRET>을 자동 전송
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${expected}`) return true;

  // 수동 테스트용: ?secret=... 쿼리 허용
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  if (secretParam && secretParam === expected) return true;

  return false;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: subs, error: subErr } = await supabase
    .from('subscribers')
    .select('id, email, site_url')
    .not('site_url', 'is', null);

  if (subErr) {
    console.error('[cron] subscribers query failed:', subErr.message);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ processed: 0, emailed: 0, reason: 'no subscribers' });
  }

  let processed = 0;
  let emailed = 0;
  const results: Array<{ email: string; outcome: string }> = [];

  for (const sub of subs) {
    if (!sub.site_url) continue;
    try {
      // 이전 스캔 최신 1건
      const { data: prev } = await supabase
        .from('scan_results')
        .select('score, summary')
        .eq('url', sub.site_url)
        .eq('status', 'completed')
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 재스캔
      const scanRes = await fetch(`${SCAN_API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sub.site_url }),
        signal: AbortSignal.timeout(90000),
      });

      if (!scanRes.ok) {
        results.push({ email: sub.email, outcome: `scan failed ${scanRes.status}` });
        continue;
      }

      const scanResult: ScanResponse = await scanRes.json();
      const summary: Record<string, string> = {};
      for (const [key, tag] of Object.entries(scanResult.tags)) {
        summary[key] = tag.status;
      }
      const hosting = scanResult.hosting || { id: 'general', name: '일반' };

      // 새 스캔 결과 DB 저장
      const base = {
        url: sub.site_url,
        status: 'completed',
        score: scanResult.score,
        total_trackers: scanResult.summary.totalTags,
        installed_trackers: scanResult.summary.detectedCount,
        summary,
        raw_result: scanResult,
        scanned_at: scanResult.scannedAt,
      };

      let insertedId: string | null = null;
      const withHosting = { ...base, hosting_id: hosting.id, hosting_name: hosting.name };
      const firstAttempt = await supabase
        .from('scan_results')
        .insert(withHosting)
        .select('id')
        .single();

      if (firstAttempt.error && /column.*hosting_(id|name)/.test(firstAttempt.error.message)) {
        const retry = await supabase.from('scan_results').insert(base).select('id').single();
        insertedId = retry.data?.id ?? null;
      } else if (firstAttempt.error) {
        console.error(`[cron] insert failed for ${sub.email}:`, firstAttempt.error.message);
        results.push({ email: sub.email, outcome: 'db insert failed' });
        continue;
      } else {
        insertedId = firstAttempt.data?.id ?? null;
      }

      processed++;

      // 변화 판단
      if (!prev) {
        results.push({ email: sub.email, outcome: 'first scan (no diff)' });
        continue;
      }

      const changes = diffSummary(prev.summary, summary);
      const scoreDelta = scanResult.score - prev.score;

      if (changes.length === 0 && scoreDelta === 0) {
        results.push({ email: sub.email, outcome: 'no change' });
        continue;
      }

      if (!insertedId) {
        results.push({ email: sub.email, outcome: 'no scan id' });
        continue;
      }

      const ok = await sendChangeEmail({
        to: sub.email,
        subscriberId: sub.id,
        siteUrl: sub.site_url,
        changes,
        prevScore: prev.score,
        newScore: scanResult.score,
        reportId: insertedId,
      });

      if (ok) {
        emailed++;
        results.push({ email: sub.email, outcome: `emailed (${changes.length} changes)` });
      } else {
        results.push({ email: sub.email, outcome: 'email send failed' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron] subscriber ${sub.id} failed:`, msg);
      results.push({ email: sub.email, outcome: `error: ${msg}` });
    }
  }

  return NextResponse.json({
    processed,
    emailed,
    total: subs.length,
    results,
  });
}
