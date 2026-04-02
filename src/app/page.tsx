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

export default function Home() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = url.trim();
    if (!trimmed) {
      setError("URL을 입력해주세요");
      return;
    }
    let finalUrl = trimmed;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = "https://" + finalUrl;
    }

    try {
      new URL(finalUrl);
    } catch {
      setError("올바른 URL을 입력해주세요 (예: www.example.com)");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: finalUrl }),
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

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError("");
              }}
              placeholder="www.example.com"
              className="flex-1 h-12 px-4 rounded-lg border border-gray-300 text-base text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "요청 중..." : "무료 진단 시작"}
            </button>
          </form>
          {error && (
            <p className="mt-2 text-sm text-red-500">{error}</p>
          )}
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
