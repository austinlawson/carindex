"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { useAuth, type AuthMode } from "@/hooks/use-auth";

export function AuthView({
  initialMode = "sign-in",
  message,
  compact = false,
  onAuthenticated
}: {
  initialMode?: AuthMode;
  message?: string;
  compact?: boolean;
  onAuthenticated?: () => void;
}) {
  const { user, loading, configured, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    const result = isSignUp
      ? await signUp({ email, password })
      : await signIn({ email, password });

    if (result.error) {
      setError(result.error);
    } else if ("needsEmailConfirmation" in result && result.needsEmailConfirmation) {
      setStatus("Check your email to confirm your CarIndex.ai account.");
    } else {
      setStatus(isSignUp ? "Account created." : "Signed in.");
      onAuthenticated?.();
    }

    setSubmitting(false);
  };

  if (user && !compact) {
    return (
      <section className="flex h-full flex-col items-center justify-center bg-[#07080b] px-5 text-center text-white">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-black">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-3xl font-black">You are signed in</h1>
        <p className="mt-2 text-sm font-semibold text-white/58">{user.email}</p>
      </section>
    );
  }

  return (
    <section
      className={`no-scrollbar h-full overflow-y-auto bg-[radial-gradient(circle_at_top,#1d2830_0%,#07080b_48%,#020203_100%)] px-5 text-white ${
        compact
          ? "pb-[calc(env(safe-area-inset-bottom)+112px)] pt-[calc(env(safe-area-inset-top)+22px)]"
          : "pb-10 pt-[calc(env(safe-area-inset-top)+34px)]"
      }`}
    >
      <div className="mx-auto max-w-[360px]">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/18 bg-cyan-200/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-50">
          <Sparkles className="h-3.5 w-3.5" />
          carindex.ai
        </div>

        <h1 className="mt-6 text-4xl font-black leading-[0.95] tracking-normal">
          {isSignUp ? "Create your car account." : "Find your next car."}
        </h1>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-white/58">
          {message ??
            "Save cars, post seller reels, make private-seller offers, and keep your watchlist across devices."}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-[24px] border border-white/8 bg-white/[0.045] p-1">
          {(["sign-in", "sign-up"] satisfies AuthMode[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`min-h-11 rounded-[20px] text-sm font-black transition active:scale-[0.98] ${
                mode === option
                  ? "bg-white text-black"
                  : "text-white/58 hover:bg-white/[0.06] hover:text-white"
              }`}
              onClick={() => {
                setMode(option);
                setError(null);
                setStatus(null);
              }}
            >
              {option === "sign-in" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form className="mt-4 rounded-[30px] border border-white/10 bg-white/[0.065] p-4" onSubmit={submit}>
          <AuthField
            label="Email"
            value={email}
            placeholder="you@example.com"
            type="email"
            onChange={setEmail}
          />
          <AuthField
            label="Password"
            value={password}
            placeholder="At least 6 characters"
            type="password"
            onChange={setPassword}
          />

          {error || status || !configured ? (
            <p
              className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-bold leading-relaxed ${
                error || !configured
                  ? "border-amber-200/18 bg-amber-200/10 text-amber-50/82"
                  : "border-emerald-200/18 bg-emerald-200/10 text-emerald-50/82"
              }`}
            >
              {!configured ? "Supabase is not configured for auth yet." : error ?? status}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!email || !password || submitting || loading || !configured}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-black transition disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]"
          >
            <LockKeyhole className="h-[18px] w-[18px]" />
            {submitting ? "Working..." : isSignUp ? "Create account" : "Sign in"}
            <ArrowRight className="h-[18px] w-[18px]" />
          </button>
        </form>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/24 p-4">
          <p className="text-xs font-semibold leading-relaxed text-white/48">
            Public feed browsing stays open. Accounts are required for posting listings,
            saving cars, making offers, and seller messaging.
          </p>
        </div>
      </div>
    </section>
  );
}

function AuthField({
  label,
  value,
  placeholder,
  type,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  type: "email" | "password";
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-3 block rounded-[22px] border border-white/10 bg-black/24 p-3 first:mt-0">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
        {label}
      </span>
      <input
        value={value}
        type={type}
        className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-white/30"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
