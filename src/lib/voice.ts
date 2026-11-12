"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 브라우저 음성 인식(Web Speech API, 한국어). 지원하지 않거나 실패하면 키보드 입력 안내를 보여 준다.
// 주의: 실제 휴대폰(iOS Safari, Android Chrome)에서 직접 시험해야 한다. 서버 음성 인식 폴백은 아직 없다.
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;

function getCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "마이크 사용이 막혀 있어요. 주소창의 자물쇠 표시에서 마이크를 허용해 주세요. 지금은 키보드로 입력할 수 있어요.",
  "service-not-allowed": "이 기기에서는 음성 입력을 쓸 수 없어요. 키보드로 입력해 주세요.",
  "no-speech": "말씀이 들리지 않았어요. 마이크를 다시 누르고 말씀해 주세요.",
  "audio-capture": "마이크를 찾지 못했어요. 키보드로 입력해 주세요.",
  network: "음성 인식 연결이 불안정해요. 키보드로 입력해 주세요.",
};

export function useVoice(getText: () => string, setText: (t: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState("");
  const rec = useRef<Rec | null>(null);

  useEffect(() => {
    setSupported(getCtor() !== null);
    return () => rec.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) {
      setNote("이 기기에서는 음성 입력을 쓸 수 없어요. 키보드로 입력해 주세요.");
      return;
    }
    setNote("");
    const base = getText();
    const r = new Ctor();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      // 말한 내용을 입력창에 글자로 보여 준다. 사용자가 확인·수정한 뒤 직접 보낸다.
      setText(base ? `${base} ${t}`.trim() : t);
    };
    r.onerror = (e) => setNote(ERRORS[e.error] ?? "음성 인식에 실패했어요. 키보드로 입력해 주세요.");
    r.onend = () => setListening(false);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setNote("음성 인식을 시작하지 못했어요. 키보드로 입력해 주세요.");
    }
  }, [listening, getText, setText]);

  return { supported, listening, note, toggle };
}
