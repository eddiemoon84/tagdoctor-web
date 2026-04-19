import { supabase } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, body: string, color: string): Response {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 32px; min-height: 100vh; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
    .box { max-width: 480px; background: #fff; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    h1 { font-size: 20px; color: ${color}; margin: 0 0 16px; }
    p { color: #374151; line-height: 1.6; margin: 0 0 16px; }
    a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>${body}</p>
    <p><a href="/">← TagDoctor 홈으로</a></p>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token || !UUID_RE.test(token)) {
    return page('❌ 잘못된 요청', '유효하지 않은 해지 링크입니다.', '#dc2626');
  }

  const { error, count } = await supabase
    .from('subscribers')
    .delete({ count: 'exact' })
    .eq('id', token);

  if (error) {
    console.error('Unsubscribe error:', error.message);
    return page('⚠️ 오류가 발생했습니다', '잠시 후 다시 시도해주세요.', '#b45309');
  }

  if (count === 0) {
    return page(
      'ℹ️ 이미 해지되었거나 존재하지 않는 구독입니다',
      '이 링크는 이미 사용되었거나 만료된 것 같습니다.',
      '#6b7280',
    );
  }

  return page(
    '✓ 이메일 수신이 해지되었습니다',
    '앞으로 TagDoctor로부터 알림 이메일을 받지 않습니다. 언제든 다시 신청하실 수 있습니다.',
    '#16a34a',
  );
}
