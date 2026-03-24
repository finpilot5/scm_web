"use client";

import { FormEvent, useEffect, useState } from "react";

import { clearStoredToken, fetchMe, hasStoredToken, loginAndStoreToken, registerUser } from "@/lib/api";

export default function SettingsPage() {
  const [hasToken, setHasToken] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const check = async () => {
      if (!hasStoredToken()) {
        setHasToken(false);
        return;
      }
      try {
        await fetchMe();
        setHasToken(true);
      } catch {
        clearStoredToken();
        setHasToken(false);
      }
    };
    void check();
  }, []);

  const onLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "").trim();
    if (!email || !password) {
      setMessage("이메일/비밀번호를 입력해 주세요.");
      return;
    }
    try {
      await loginAndStoreToken(email, password);
      await fetchMe();
      setHasToken(true);
      setMessage("로그인 성공. 이제 품목/재고 등록이 가능합니다.");
      e.currentTarget.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "로그인 실패");
    }
  };

  const onRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "").trim();
    if (!name || !email || !password) {
      setMessage("이름/이메일/비밀번호를 입력해 주세요.");
      return;
    }
    try {
      await registerUser({ name, email, password, role: "ADMIN" });
      await loginAndStoreToken(email, password);
      await fetchMe();
      setHasToken(true);
      setMessage("회원가입 및 로그인 완료. 이제 등록 작업을 진행할 수 있습니다.");
      e.currentTarget.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "회원가입 실패");
    }
  };

  return (
    <div className="space-y-4 py-4">
      <h1 className="text-3xl font-semibold">Settings</h1>

      <div
        className={`rounded-2xl border p-4 text-sm ${
          hasToken ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        인증 토큰 상태: <strong>{hasToken ? "로그인됨" : "미로그인"}</strong>
      </div>

      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      <form onSubmit={onRegister} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-soft md:max-w-xl">
        <div className="text-sm font-medium text-slate-700">회원가입</div>
        <input name="name" placeholder="이름" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <input name="email" type="email" placeholder="이메일" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
        />
        <button type="submit" className="w-fit rounded-xl bg-stock px-4 py-2 text-white">
          회원가입 + 로그인
        </button>
      </form>

      <form onSubmit={onLogin} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-soft md:max-w-xl">
        <div className="text-sm font-medium text-slate-700">기존 계정 로그인</div>
        <input name="email" type="email" placeholder="이메일" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded-xl bg-stock px-4 py-2 text-white">
            로그인
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700"
            onClick={() => {
              clearStoredToken();
              setHasToken(false);
              setMessage("토큰을 삭제했습니다.");
            }}
          >
            토큰 삭제
          </button>
        </div>
      </form>
    </div>
  );
}
