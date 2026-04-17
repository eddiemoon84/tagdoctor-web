"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TRACKERS = [
  { emoji: "📘", name: "Meta Pixel" },
  { emoji: "📊", name: "GA4" },
  { emoji: "📦", name: "GTM" },
  { emoji: "💚", name: "네이버 전환추적" },
  { emoji: "💬", name: "카카오 픽셀" },
  { emoji: "🎵", name: "TikTok Pixel" },
  { emoji: "🟠", name: "Criteo" },
  { emoji: "📰", name: "Dable" },
];

const VALUES = [
  {
    emoji: "⚡",
    title: "30초 진단",
    desc: "URL만 입력하면 자동으로 8개 매체 트래킹 상태를 체크합니다",
  },
  {
    emoji: "💊",
    title: "문제 발견 + 처방",
    desc: "단순히 '오류'가 아니라 왜 문제인지, 어떻게 고치는지까지 알려드립니다",
  },
  {
    emoji: "🆓",
    title: "무료",
    desc: "회원가입 없이 지금 바로 사용할 수 있습니다",
  },
];

const FAQS = [
  {
    q: "어떤 사이트든 스캔할 수 있나요?",
    a: "네, 공개된 웹사이트라면 모두 가능합니다. 봇 차단이 강한 일부 사이트는 제한될 수 있습니다.",
  },
  {
    q: "스캔하면 내 사이트에 영향이 있나요?",
    a: "아닙니다. 일반 방문자처럼 페이지를 한 번 로드하는 것뿐입니다.",
  },
  {
    q: "처방 정보는 정확한가요?",
    a: "한국 주요 쇼핑몰 실제 검증을 거쳤습니다. 카페24, 아임웹, 고도몰 등 호스팅별 맞춤 처방을 제공합니다.",
  },
];

const PAGE_TYPE_OPTIONS = [
  { id: "product", label: "📦 상품 상세 페이지", placeholder: "예시 상품 페이지 URL을 입력하세요" },
  { id: "cart", label: "🛒 장바구니 페이지", placeholder: "장바구니 페이지 URL" },
  { id: "checkout", label: "💳 결제 페이지", placeholder: "결제 페이지 URL" },
  { id: "thankyou", label: "✅ 결제 완료 페이지", placeholder: "결제 완료 페이지 URL" },
] as const;

type PageTypeId = (typeof PAGE_TYPE_OPTIONS)[number]["id"];

interface ExtraPage {
  type: PageTypeId;
  url: string;
}

export default function Home() {
  const [mainUrl, setMainUrl] = useState("");
  const [extraPages, setExtraPages] = useState<ExtraPage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const availableTypes = PAGE_TYPE_OPTIONS.filter(
    (opt) => !extraPages.some((p) => p.type === opt.id),
  );

  const addPage = (type: PageTypeId) => {
    setExtraPages((prev) => [...prev, { type, url: "" }]);
  };

  const updatePage = (index: number, url: string) => {
    setExtraPages((prev) => prev.map((p, i) => (i === index ? { ...p, url } : p)));
  };

  const removePage = (index: number) => {
    setExtraPages((prev) => prev.filter((_, i) => i !== index));
  };

  const normalizeUrl = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      new URL(url);
      return url;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const main = normalizeUrl(mainUrl);
    if (!main) {
      setError("메인 페이지 URL을 올바르게 입력해주세요");
      return;
    }

    const filledExtras = extraPages.filter((p) => p.url.trim());
    const normalizedExtras: { url: string; type: string }[] = [];
    for (const p of filledExtras) {
      const url = normalizeUrl(p.url);
      if (!url) {
        setError(`${PAGE_TYPE_OPTIONS.find((o) => o.id === p.type)?.label} URL을 확인해주세요`);
        return;
      }
      normalizedExtras.push({ url, type: p.type });
    }

    setLoading(true);
    try {
      const isMulti = normalizedExtras.length > 0;
      const payload = isMulti
        ? { pages: [{ url: main, type: "home" }, ...normalizedExtras] }
        : { url: main };

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "스캔 요청에 실패했습니다");
        setLoading(false);
        return;
      }

      router.push(`/scan/${data.id}`);
    } catch {
      setError("서버 연결에 실패했습니다");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-slate-50 py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            내 사이트 광고 트래킹,
            <br />
            지금 제대로 되고 있나요?
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            URL만 입력하면 메타 픽셀, GA4, 네이버 전환추적, 카카오 픽셀 상태를
            <br className="hidden sm:block" />
            1분 안에 진단합니다
          </p>

          <form onSubmit={handleSubmit} className="mt-8 max-w-lg mx-auto text-left">
            <label className="block text-sm font-semibold text-gray-700">
              메인 페이지 URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={mainUrl}
              onChange={(e) => {
                setMainUrl(e.target.value);
                if (error) setError("");
              }}
              placeholder="www.example.com"
              className="mt-2 w-full h-12 px-4 rounded-lg border border-gray-300 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {extraPages.length > 0 && (
              <div className="mt-5 space-y-4">
                {extraPages.map((page, idx) => {
                  const opt = PAGE_TYPE_OPTIONS.find((o) => o.id === page.type);
                  return (
                    <div key={page.type}>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">
                          {opt?.label}
                        </label>
                        <button
                          type="button"
                          onClick={() => removePage(idx)}
                          className="text-xs text-gray-400 hover:text-red-500 cursor-pointer"
                        >
                          제거
                        </button>
                      </div>
                      <input
                        type="text"
                        value={page.url}
                        onChange={(e) => {
                          updatePage(idx, e.target.value);
                          if (error) setError("");
                        }}
                        placeholder={opt?.placeholder}
                        className="mt-1.5 w-full h-11 px-4 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {availableTypes.length > 0 && extraPages.length < 4 && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">페이지 추가 (선택, 최대 4개)</p>
                <div className="flex flex-wrap gap-2">
                  {availableTypes.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => addPage(opt.id)}
                      className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 hover:border-blue-500 hover:text-blue-600 cursor-pointer"
                    >
                      + {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full h-12 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "요청 중..." : "무료 진단 시작"}
            </button>
            {error && (
              <p className="mt-3 text-sm text-red-500 text-center">{error}</p>
            )}
          </form>
        </div>
      </section>

      {/* Trackers */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center">
            이런 것들을 진단합니다
          </h2>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
            {TRACKERS.map((t) => (
              <div
                key={t.name}
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-gray-50"
              >
                <span className="text-3xl">{t.emoji}</span>
                <span className="text-sm font-medium text-gray-700">
                  {t.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-16 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="bg-white rounded-xl p-6 text-center"
            >
              <span className="text-4xl">{v.emoji}</span>
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                {v.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                {v.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center">
            자주 묻는 질문
          </h2>
          <div className="mt-10 space-y-6">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="text-base font-semibold text-gray-900">
                  Q. {f.q}
                </h3>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-100">
        <div className="max-w-2xl mx-auto text-center text-sm text-gray-400">
          <p>TagDoctor — 광고 트래킹 진단 도구 | 문의: eddiemoon84@gmail.com</p>
        </div>
      </footer>
    </div>
  );
}
