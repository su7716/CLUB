// AI 호출(Anthropic Messages API). 서버에서만 쓴다.
// ANTHROPIC_API_KEY 가 없거나 호출이 두 번 실패하면 호출하는 쪽이 수동 입력 모드로 넘어간다.
// 주의: 이 파일의 API 호출 부분은 아직 실제 키로 시험하지 못했다.

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Msg = { role: "user" | "assistant"; content: string };

async function callOnce(system: string, messages: Msg[], maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).map((c) => c.text ?? "").join("").trim();
}

// 재시도 1회. 그래도 실패하면 null 을 돌려주고, 호출한 쪽이 수동 모드로 바꾼다.
export async function ask(system: string, messages: Msg[], maxTokens = 1500): Promise<string | null> {
  if (!isAiEnabled()) return null;
  for (let i = 0; i < 2; i++) {
    try {
      const out = await callOnce(system, messages, maxTokens);
      if (out) return out;
    } catch {
      /* 다시 시도 */
    }
  }
  return null;
}

const BASE = (guidelines: string) =>
  `당신은 원우회 회원의 소개 글을 돕는 편집자입니다. 반드시 한국어로 답하세요.\n\n[관리자 지침]\n${guidelines}`;

export function followUpPrompt(guidelines: string, qa: { q: string; a: string }[]): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n지금까지의 질문과 답을 보고, 더 알고 싶은 후속 질문을 한 문장으로만 하세요. 신원이 드러나는 것은 묻지 마세요. 더 물을 것이 없으면 정확히 "없음"이라고만 답하세요.`,
    messages: [{ role: "user", content: qa.map((x) => `질문: ${x.q}\n답: ${x.a}`).join("\n\n") }],
  };
}

export function draftPrompt(guidelines: string, answers: string[]): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n아래 인터뷰 답변으로 별칭 소개 글(약 2페이지)을 쓰세요. 소개 글만 출력하세요.`,
    messages: [{ role: "user", content: answers.join("\n\n") }],
  };
}

export function truthLiesPrompt(guidelines: string, intro: string, unusedAnswers: string[]): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n소개 글에 쓰지 않은 내용으로 '2진실 1거짓' 문장 3개를 만드세요. JSON 한 줄로만 답하세요: {"statements":["...","...","..."],"lieIndex":0}`,
    messages: [{ role: "user", content: `소개 글:\n${intro}\n\n쓰지 않은 답변:\n${unusedAnswers.join("\n")}` }],
  };
}

export function revisePrompt(guidelines: string, current: string, request: string): { system: string; messages: Msg[] } {
  return {
    system: `${BASE(guidelines)}\n\n회원의 수정 요청이 관리자 지침에 어긋나면 첫 줄에 정확히 "거절:" 로 시작해 이유를 한 문장으로 쓰세요. 지침에 맞으면 요청대로 고친 소개 글만 출력하세요.`,
    messages: [{ role: "user", content: `현재 글:\n${current}\n\n수정 요청: ${request}` }],
  };
}
