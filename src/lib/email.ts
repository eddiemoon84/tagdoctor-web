import { Resend } from 'resend';

const TRACKER_LABELS: Record<string, string> = {
  meta_pixel: 'Meta Pixel',
  ga4: 'GA4',
  gtm: 'GTM',
  naver: '네이버 전환추적',
  kakao: '카카오 픽셀',
  tiktok: 'TikTok Pixel',
  criteo: 'Criteo OneTag',
  dable: 'Dable',
};

const STATUS_LABELS: Record<string, string> = {
  ok: '정상',
  duplicate: '중복 설치',
  multi_container: '복수 컨테이너',
  no_event: '이벤트 미감지',
  partial_events: '이벤트 일부 누락',
  missing_events: '이벤트 전부 누락',
  not_installed: '미설치',
};

export interface ChangeItem {
  trackerKey: string;
  from: string;
  to: string;
}

export function diffSummary(
  prev: Record<string, string> | null | undefined,
  current: Record<string, string>,
): ChangeItem[] {
  const changes: ChangeItem[] = [];
  if (!prev) return changes;
  const keys = new Set([...Object.keys(prev), ...Object.keys(current)]);
  for (const key of keys) {
    const from = prev[key] || 'not_installed';
    const to = current[key] || 'not_installed';
    if (from !== to) {
      changes.push({ trackerKey: key, from, to });
    }
  }
  return changes;
}

interface ChangeEmailParams {
  to: string;
  subscriberId: string;
  siteUrl: string;
  changes: ChangeItem[];
  prevScore: number;
  newScore: number;
  reportId: string;
}

export async function sendChangeEmail(params: ChangeEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping send');
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tagdoctor.example.com';
  const reportUrl = `${appUrl}/scan/${params.reportId}`;
  const unsubUrl = `${appUrl}/api/subscribe/unsubscribe?token=${encodeURIComponent(params.subscriberId)}`;

  const scoreDelta = params.newScore - params.prevScore;
  const scoreChangeText =
    scoreDelta === 0
      ? `${params.newScore}점 (변화 없음)`
      : `${params.prevScore} → ${params.newScore} (${scoreDelta > 0 ? '+' : ''}${scoreDelta}점)`;

  const changeLines = params.changes.map((c) => {
    const label = TRACKER_LABELS[c.trackerKey] || c.trackerKey;
    const from = STATUS_LABELS[c.from] || c.from;
    const to = STATUS_LABELS[c.to] || c.to;
    return `${label}: ${from} → ${to}`;
  });

  const html = renderEmailHtml({
    siteUrl: params.siteUrl,
    scoreChangeText,
    changeLines,
    reportUrl,
    unsubUrl,
  });

  const text = [
    '안녕하세요,',
    `${params.siteUrl}의 트래킹 상태가 지난주 대비 변경되었습니다.`,
    '',
    '⚠️ 주요 변화:',
    ...changeLines.map((l) => `• ${l}`),
    '',
    `전체 점수: ${scoreChangeText}`,
    '',
    `👉 상세 리포트 보기: ${reportUrl}`,
    '',
    `이메일 수신 해지: ${unsubUrl}`,
  ].join('\n');

  try {
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM || 'TagDoctor <onboarding@resend.dev>';
    const result = await resend.emails.send({
      from,
      to: params.to,
      subject: '[TagDoctor] 당신의 사이트 트래킹 상태에 변화가 감지되었습니다',
      html,
      text,
    });

    if (result.error) {
      console.error('[email] send failed:', result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send exception:', err);
    return false;
  }
}

function renderEmailHtml(opts: {
  siteUrl: string;
  scoreChangeText: string;
  changeLines: string[];
  reportUrl: string;
  unsubUrl: string;
}): string {
  const bullets = opts.changeLines
    .map((l) => `<li style="margin:4px 0;">${escapeHtml(l)}</li>`)
    .join('');
  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
    <h1 style="font-size:18px;margin:0 0 12px;color:#111827;">⚠️ 트래킹 상태에 변화가 감지되었습니다</h1>
    <p style="color:#374151;line-height:1.6;margin:0 0 16px;">
      <strong>${escapeHtml(opts.siteUrl)}</strong>의 광고 트래킹 상태가 지난주 대비 변경되었습니다.
    </p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="font-weight:600;margin:0 0 8px;color:#92400e;">주요 변화</p>
      <ul style="margin:0;padding-left:20px;color:#78350f;">${bullets}</ul>
    </div>
    <p style="color:#374151;margin:16px 0;">
      전체 점수: <strong>${escapeHtml(opts.scoreChangeText)}</strong>
    </p>
    <p style="margin:24px 0;">
      <a href="${escapeHtml(opts.reportUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">
        상세 리포트 보기 →
      </a>
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;" />
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      이 이메일은 TagDoctor에서 자동 감시를 신청하신 분께 발송됩니다.<br />
      <a href="${escapeHtml(opts.unsubUrl)}" style="color:#9ca3af;">이메일 수신 해지</a>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
