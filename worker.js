/**
 * 화원조경기술사사무소 — 설계 문답(Q&A) 서버리스 함수 (Cloudflare Worker)
 *
 * 역할:
 *   홈페이지에서 받은 질문을 Claude에게 전달하고, 답변을 돌려줍니다.
 *   Anthropic API 키는 이 함수의 환경변수(Secret)에 저장되어 외부에 노출되지 않습니다.
 *
 * 배포 요약:
 *   1) Cloudflare 계정 → Workers & Pages → Create → Worker 생성
 *   2) 이 파일 내용을 그대로 붙여넣고 Deploy
 *   3) Settings → Variables and Secrets 에서
 *        ANTHROPIC_API_KEY = (Anthropic 콘솔에서 발급한 키)  ← Secret(암호화)로 추가
 *   4) ALLOWED_ORIGIN 값을 본인 도메인으로 두세요 (아래 코드 상단)
 *   5) 배포된 주소(예: https://hwawon-qna.<서브도메인>.workers.dev)를
 *        index.html 의 QNA_ENDPOINT 에 붙여넣기
 */

// 이 도메인에서 오는 요청만 허용 (CORS). 필요시 추가하세요.
const ALLOWED_ORIGINS = [
  "https://www.hwawon.pro",
  "https://hwawon.pro",
];

const SYSTEM_PROMPT = `당신은 서울 금천구 '화원조경기술사사무소(HWAWON Associates)'의 대표입니다.
화원은 '공간을 장소로 만드는 어소시에이츠'를 표방하며, 다음 가치를 바탕으로 답변합니다.

[설계 가치]
- 모두를 위한 설계 (Communitas): 누구나 동등하게 누리는 공간, 무장애(BF)와 유니버설 디자인
- 시간을 잇는 설계 (Memoria): 역사와 전통의 기억을 잇는 설계, 한국 전통정원의 깊이
- 장소의 혼을 담는 설계 (Genius Loci): 그곳에만 있는 장소성(場所性)

[디자인 가치 — 설계의 기본 요소]
- 형태 (Form): 비례와 구조, 공간의 골격
- 기능 (Function): 쓰임과 동선, 안전과 효율
- 감각 (Sense): 빛·바람·소리·계절의 오감

[화원의 정체성]
- 花苑 꽃의 정원, 和園 어울림의 뜰, 話園 이야기의 정원

답변 지침:
- 화원의 대표로서 따뜻하고 품격 있게, 전문성을 담아 한국어로 답합니다.
- '공간을 장소로 만든다'는 철학을 자연스럽게 녹입니다.
- 너무 길지 않게, 4~8문장 내외로 핵심을 전합니다.
- 형식: 첫 줄에 '### [전문가의 답변]' 을 쓰고, 다음 줄부터 내용을 적습니다.`;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    // 프리플라이트
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    try {
      const { question } = await request.json();
      if (!question || typeof question !== "string" || question.length > 1000) {
        return new Response(JSON.stringify({ error: "질문이 올바르지 않습니다." }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: question }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Anthropic API error:", resp.status, errText);
        return new Response(JSON.stringify({ error: "AI 응답 오류" }), {
          status: 502,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const answer = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return new Response(JSON.stringify({ answer }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response(JSON.stringify({ error: "서버 오류" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  },
};
