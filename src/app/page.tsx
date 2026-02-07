"use client";

import Script from "next/script";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type GeoOption = {
  id: string;
  name: string;
  code?: string;
};

type ProfileForm = {
  fullName: string;
  nickname: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  admin1Id: string;
  admin1Name: string;
  admin1Code: string;
  cityId: string;
  cityName: string;
  postalCode: string;
  addressDetail: string;
  birthDate: string;
  gender: string;
};

const quickPrompts = [
  "Siapa itu Akhdaan?",
  "Profil singkat Akhdaan.",
  "Project yang dikerjakan Akhdaan.",
];

const agreementText =
  "Dengan menggunakan Zephyr AI, kamu menyetujui bahwa data identitas yang diberikan " +
  "digunakan untuk personalisasi layanan dan keamanan akun. Data tidak akan dibagikan " +
  "ke pihak ketiga tanpa persetujuanmu.";

const cscApiKey = process.env.NEXT_PUBLIC_CSC_API_KEY ?? "";
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const zippopotamBase = "https://api.zippopotam.us";

const ZephyrLogo = () => (
  <div className="inline-flex items-center gap-3">
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="h-9 w-9 text-emerald-200"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 18c6-6 20-6 26 0" />
      <path d="M6 28c8-6 22-6 30 0" />
      <path d="M14 36c4-3 12-3 16 0" />
    </svg>
    <div>
      <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">
        Zephyr
      </p>
      <p className="text-lg font-semibold text-white">Zephyr AI</p>
    </div>
  </div>
);

const emptyProfile: ProfileForm = {
  fullName: "",
  nickname: "",
  countryId: "",
  countryName: "",
  countryCode: "",
  admin1Id: "",
  admin1Name: "",
  admin1Code: "",
  cityId: "",
  cityName: "",
  postalCode: "",
  addressDetail: "",
  birthDate: "",
  gender: "",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfile);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [countries, setCountries] = useState<GeoOption[]>([]);
  const [admin1Options, setAdmin1Options] = useState<GeoOption[]>([]);
  const [cityOptions, setCityOptions] = useState<GeoOption[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [postalLoading, setPostalLoading] = useState(false);
  const [postalError, setPostalError] = useState<string | null>(null);
  const [postalValid, setPostalValid] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const lastAssistant = useMemo(
    () => messages.filter((msg) => msg.role === "assistant").at(-1),
    [messages],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    (
      window as { turnstileCallback?: (token: string) => void }
    ).turnstileCallback = (token: string) => {
      setTurnstileToken(token);
    };
    (window as { turnstileExpired?: () => void }).turnstileExpired = () => {
      setTurnstileToken(null);
    };
    (window as { turnstileError?: () => void }).turnstileError = () => {
      setTurnstileToken(null);
    };

    return () => {
      delete (window as { turnstileCallback?: (token: string) => void })
        .turnstileCallback;
      delete (window as { turnstileExpired?: () => void }).turnstileExpired;
      delete (window as { turnstileError?: () => void }).turnstileError;
    };
  }, []);

  const fetchCsc = async <T,>(url: string): Promise<T> => {
    if (!cscApiKey) {
      throw new Error("CSC API key belum diisi.");
    }
    const response = await fetch(url, {
      headers: { "X-CSCAPI-KEY": cscApiKey },
    });
    if (!response.ok) {
      throw new Error("CSC API error");
    }
    return (await response.json()) as T;
  };

  useEffect(() => {
    const loadCountries = async () => {
      if (!cscApiKey) {
        setGeoError("CSC API key belum diisi.");
        return;
      }

      setGeoLoading(true);
      setGeoError(null);

      try {
        const data = await fetchCsc<
          Array<{ id: number; name: string; iso2: string }>
        >("https://api.countrystatecity.in/v1/countries");
        const nextCountries = data.map((item) => ({
          id: String(item.id),
          name: item.name,
          code: item.iso2,
        }));
        nextCountries.sort((a, b) => a.name.localeCompare(b.name));
        setCountries(nextCountries);
      } catch (error) {
        setGeoError(
          error instanceof Error ? error.message : "Gagal memuat negara.",
        );
      } finally {
        setGeoLoading(false);
      }
    };

    void loadCountries();
  }, []);

  useEffect(() => {
    const loadStates = async () => {
      if (!profileForm.countryCode || !cscApiKey) {
        setAdmin1Options([]);
        setCityOptions([]);
        return;
      }

      setGeoLoading(true);
      setGeoError(null);

      try {
        const data = await fetchCsc<
          Array<{ id: number; name: string; iso2: string }>
        >(
          `https://api.countrystatecity.in/v1/countries/${profileForm.countryCode}/states`,
        );
        const nextStates = data.map((item) => ({
          id: String(item.id),
          name: item.name,
          code: item.iso2,
        }));
        nextStates.sort((a, b) => a.name.localeCompare(b.name));
        setAdmin1Options(nextStates);
      } catch (error) {
        setGeoError(
          error instanceof Error ? error.message : "Gagal memuat provinsi.",
        );
      } finally {
        setGeoLoading(false);
      }
    };

    void loadStates();
  }, [profileForm.countryCode]);

  useEffect(() => {
    const loadCities = async () => {
      if (!profileForm.countryCode || !profileForm.admin1Code || !cscApiKey) {
        setCityOptions([]);
        return;
      }

      setGeoLoading(true);
      setGeoError(null);

      try {
        const data = await fetchCsc<Array<{ id: number; name: string }>>(
          `https://api.countrystatecity.in/v1/countries/${profileForm.countryCode}/states/${profileForm.admin1Code}/cities`,
        );
        const nextCities = data.map((item) => ({
          id: String(item.id),
          name: item.name,
        }));
        nextCities.sort((a, b) => a.name.localeCompare(b.name));
        setCityOptions(nextCities);
      } catch (error) {
        setGeoError(
          error instanceof Error ? error.message : "Gagal memuat kota.",
        );
      } finally {
        setGeoLoading(false);
      }
    };

    void loadCities();
  }, [profileForm.countryCode, profileForm.admin1Code]);

  useEffect(() => {
    const validatePostal = async () => {
      if (!profileForm.countryCode || !profileForm.postalCode.trim()) {
        setPostalValid(false);
        setPostalError(null);
        return;
      }

      setPostalLoading(true);
      setPostalError(null);

      try {
        const response = await fetch(
          `${zippopotamBase}/${profileForm.countryCode.toLowerCase()}/${profileForm.postalCode.trim()}`,
        );
        if (!response.ok) {
          setPostalValid(false);
          setPostalError(
            "Kode pos tidak tervalidasi (negara belum didukung atau kode tidak ditemukan).",
          );
          return;
        }
        setPostalValid(true);
        setPostalError(null);
      } catch (error) {
        setPostalValid(false);
        setPostalError(
          error instanceof Error
            ? error.message
            : "Kode pos tidak tervalidasi (negara belum didukung).",
        );
      } finally {
        setPostalLoading(false);
      }
    };

    void validatePostal();
  }, [profileForm.countryCode, profileForm.postalCode]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!currentUser) {
        setProfileComplete(false);
        setProfileForm(emptyProfile);
        setAgreementAccepted(false);
        return;
      }

      setProfileLoading(true);
      setProfileError(null);

      try {
        const ref = doc(db, "profiles", currentUser.uid);
        const snapshot = await getDoc(ref);
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<ProfileForm> & {
            agreementAccepted?: boolean;
            address?: string;
          };
          setProfileForm({
            fullName: data.fullName ?? "",
            nickname: data.nickname ?? "",
            countryId: data.countryId ?? "",
            countryName: data.countryName ?? "",
            countryCode: data.countryCode ?? "",
            admin1Id: data.admin1Id ?? "",
            admin1Name: data.admin1Name ?? "",
            admin1Code: data.admin1Code ?? "",
            cityId: data.cityId ?? "",
            cityName: data.cityName ?? "",
            postalCode: data.postalCode ?? "",
            addressDetail: data.addressDetail ?? data.address ?? "",
            birthDate: data.birthDate ?? "",
            gender: data.gender ?? "",
          });
          const accepted = Boolean(data.agreementAccepted);
          const hasAddress = Boolean(
            data.countryId &&
            data.admin1Id &&
            data.cityId &&
            data.postalCode &&
            data.addressDetail,
          );
          setAgreementAccepted(accepted);
          setProfileComplete(accepted && hasAddress);
        } else {
          setProfileComplete(false);
        }
      } catch (error) {
        setProfileError(
          error instanceof Error ? error.message : "Gagal memuat profil.",
        );
      } finally {
        setProfileLoading(false);
      }
    };

    void loadProfile();
  }, [currentUser]);

  const verifyTurnstile = async () => {
    if (!turnstileSiteKey) {
      return { ok: false, error: "Turnstile site key belum diisi." };
    }

    if (!turnstileToken) {
      return { ok: false, error: "Selesaikan captcha dulu." };
    }

    const response = await fetch("/api/verify-turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: turnstileToken }),
    });

    const data = (await response.json()) as { success?: boolean };
    if (!response.ok || !data.success) {
      return { ok: false, error: "Captcha gagal diverifikasi." };
    }

    return { ok: true };
  };

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);

    const captcha = await verifyTurnstile();
    if (!captcha.ok) {
      setAuthError(captcha.error ?? "Captcha gagal diverifikasi.");
      return;
    }

    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, userEmail, userPassword);
      } else {
        await signInWithEmailAndPassword(auth, userEmail, userPassword);
      }
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Gagal autentikasi. Coba lagi.",
      );
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);

    const captcha = await verifyTurnstile();
    if (!captcha.ok) {
      setAuthError(captcha.error ?? "Captcha gagal diverifikasi.");
      return;
    }

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Login Google gagal. Coba lagi.",
      );
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMessages([]);
    setProfileComplete(false);
  };

  const handleAgreementAccept = async () => {
    if (!currentUser) {
      setProfileError("Sesi login tidak ditemukan.");
      return;
    }

    try {
      setProfileLoading(true);
      setProfileError(null);
      const ref = doc(db, "profiles", currentUser.uid);
      await setDoc(
        ref,
        {
          agreementAccepted: true,
          agreementAcceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setAgreementAccepted(true);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Gagal menyimpan persetujuan.",
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);

    if (!cscApiKey) {
      setProfileError("CSC API key belum diisi.");
      return;
    }

    if (
      !profileForm.countryId ||
      !profileForm.admin1Id ||
      !profileForm.cityId ||
      !profileForm.postalCode.trim() ||
      !profileForm.addressDetail.trim()
    ) {
      setProfileError("Lengkapi alamat secara lengkap terlebih dahulu.");
      return;
    }

    if (!currentUser) {
      setProfileError("Sesi login tidak ditemukan.");
      return;
    }

    try {
      setProfileLoading(true);
      const ref = doc(db, "profiles", currentUser.uid);
      await setDoc(
        ref,
        {
          ...profileForm,
          agreementAccepted: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (profileForm.nickname.trim()) {
        await updateProfile(currentUser, {
          displayName: profileForm.nickname.trim(),
        });
      }

      setProfileComplete(true);
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Gagal menyimpan profil.",
      );
    } finally {
      setProfileLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const token = await currentUser?.getIdToken();
      if (!token) {
        throw new Error("Silakan login dulu untuk memakai Zephyr.");
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await response.json()) as {
        content?: string;
        error?: string;
        details?: string;
      };
      if (!response.ok) {
        const fallback = "Groq request failed";
        const details = data.details ? `: ${data.details}` : "";
        throw new Error(`${data.error ?? fallback}${details}`);
      }

      const reply = data.content?.trim() || "Maaf, belum ada jawaban.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan. Coba lagi dalam beberapa saat.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  const summaryCards = (
    <>
      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-400">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Terakhir
        </p>
        <p className="mt-2 text-sm text-zinc-200">
          {lastAssistant?.content || "Belum ada jawaban dari Zephyr."}
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-400">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Tips
        </p>
        <ul className="mt-2 space-y-2 text-sm text-zinc-400">
          <li>Gunakan konteks jelas untuk jawaban yang tajam.</li>
          <li>Tambahkan batasan waktu, format, atau gaya penulisan.</li>
          <li>Gunakan bahasa campuran jika perlu.</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-400">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Sistem
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Groq API aktif, mode respons cepat.
        </p>
      </div>
    </>
  );

  const chatPanel = (
    <div
      className={`zephyr-panel zephyr-glow flex h-full w-full flex-col rounded-3xl p-6 sm:p-8 ${
        isWide ? "" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
            Live Session
          </p>
          <h2 className="text-2xl font-semibold text-white">Chat Zephyr</h2>
        </div>
        <span className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-400">
          {isLoading ? "Menganalisa" : "Siap"}
        </span>
      </div>

      <div className="mt-6 flex min-h-[320px] flex-1 flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center rounded-2xl border border-dashed border-zinc-800 p-8 text-sm text-zinc-500">
            <p className="mb-4 text-base text-zinc-300">
              Mulai percakapan dengan salah satu prompt cepat.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-left text-sm text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`animate-rise rounded-2xl border px-4 py-3 text-sm leading-relaxed sm:text-base ${
                  message.role === "user"
                    ? "ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-50"
                    : "border-zinc-800 bg-zinc-950/70 text-zinc-100"
                }`}
              >
                {message.content}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400/70 animate-pulse-soft" />
                Zephyr sedang mengetik...
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <div className="rounded-2xl border border-zinc-800 bg-black/60 p-4">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanyakan apa saja ke Zephyr..."
            rows={3}
            className="w-full resize-none bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600 sm:text-base"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Tekan Enter untuk kirim, Shift + Enter untuk baris baru.
            </span>
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Kirim
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        Memuat autentikasi...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="relative min-h-screen overflow-hidden text-zinc-100">
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="lazyOnload"
        />
        <div className="pointer-events-none absolute inset-0 zephyr-grid opacity-20" />
        <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-10 px-6 py-14">
          <div className="zephyr-panel zephyr-glow grid w-full gap-0 overflow-hidden rounded-3xl lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative hidden min-h-[520px] flex-col justify-between bg-gradient-to-br from-[#0b0f10] via-[#111718] to-[#040606] p-10 text-white lg:flex">
              <div className="absolute inset-0">
                <div className="absolute -left-20 -top-16 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
                <div className="absolute bottom-10 right-10 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="absolute left-10 top-40 h-32 w-32 rounded-full border border-emerald-300/20" />
              </div>
              <div className="relative">
                <ZephyrLogo />
                <h1 className="mt-4 text-4xl font-semibold leading-tight">
                  Ruang percakapan
                  <br />
                  cepat dan elegan.
                </h1>
                <p className="mt-4 text-sm text-emerald-100/70">
                  Autentikasi aman dengan Firebase dan respons super cepat
                  berkat Groq.
                </p>
              </div>
              <div className="relative rounded-2xl border border-emerald-500/20 bg-black/40 p-4 text-xs text-emerald-100/80">
                <p className="text-sm text-emerald-50">
                  Login untuk mengakses Zephyr AI.
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center px-8 py-10 sm:px-10">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">
                  Zephyr Access
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-white">
                  {isRegister ? "Buat akun baru" : "Masuk ke Zephyr"}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  {isRegister
                    ? "Daftar untuk mulai menggunakan Zephyr AI."
                    : "Login untuk melanjutkan sesi kamu."}
                </p>
              </div>
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(event) => setUserEmail(event.target.value)}
                  placeholder="Email"
                  className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <input
                  type="password"
                  required
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                />
                <div className="rounded-2xl border border-zinc-800 bg-black/50 px-4 py-3 text-xs text-zinc-400">
                  <div
                    className="cf-turnstile"
                    data-sitekey={turnstileSiteKey}
                    data-callback="turnstileCallback"
                    data-expired-callback="turnstileExpired"
                    data-error-callback="turnstileError"
                    data-theme="dark"
                  />
                </div>
                {!turnstileSiteKey && (
                  <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                    Turnstile belum dikonfigurasi.
                  </p>
                )}
                {authError && (
                  <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                    {authError}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
                >
                  {isRegister ? "Daftar" : "Login"}
                </button>
              </form>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister((prev) => !prev);
                    setTurnstileToken(null);
                  }}
                  className="text-zinc-300 transition hover:text-white"
                >
                  {isRegister
                    ? "Sudah punya akun? Login"
                    : "Belum punya akun? Daftar"}
                </button>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950/40 px-4 py-2 text-xs text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900/60 hover:text-white"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                  >
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.86-.08-1.7-.22-2.5H12v4.74h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.96-1.07 7.95-2.89l-3.88-3.01c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.11A12 12 0 0 0 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.3A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.56.37-2.3V6.59H1.27A12 12 0 0 0 0 12c0 1.94.47 3.77 1.27 5.41l4-3.11z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.36.61 4.61 1.82l3.45-3.45C17.96 1.2 15.24 0 12 0A12 12 0 0 0 1.27 6.59l4 3.11C6.22 6.86 8.87 4.75 12 4.75z"
                    />
                  </svg>
                  Login dengan Google
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profileLoading && !profileComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-300">
        Menyiapkan profil...
      </div>
    );
  }

  if (!profileComplete) {
    if (!agreementAccepted) {
      return (
        <div className="relative min-h-screen overflow-hidden text-zinc-100">
          <div className="pointer-events-none absolute inset-0 zephyr-grid opacity-20" />
          <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-10 px-6 py-14">
            <div className="zephyr-panel zephyr-glow w-full max-w-2xl rounded-3xl p-8 sm:p-10">
              <div className="mb-6 text-center">
                <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">
                  Zephyr Agreement
                </p>
                <h1 className="mt-3 text-3xl font-semibold text-white">
                  User Agreement
                </h1>
                <p className="mt-2 text-sm text-zinc-400">{agreementText}</p>
              </div>
              {profileError && (
                <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {profileError}
                </p>
              )}
              <button
                type="button"
                onClick={handleAgreementAccept}
                disabled={profileLoading}
                className="mt-4 w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {profileLoading ? "Menyimpan..." : "Saya Setuju"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative min-h-screen overflow-hidden text-zinc-100">
        <div className="pointer-events-none absolute inset-0 zephyr-grid opacity-20" />
        <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-10 px-6 py-14">
          <div className="zephyr-panel zephyr-glow w-full max-w-2xl rounded-3xl p-8 sm:p-10">
            <div className="mb-6 text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">
                Zephyr Profile
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                Lengkapi identitas dulu
              </h1>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <input
                type="text"
                required
                value={profileForm.fullName}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    fullName: event.target.value,
                  }))
                }
                placeholder="Nama lengkap"
                className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <input
                type="text"
                required
                value={profileForm.nickname}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    nickname: event.target.value,
                  }))
                }
                placeholder="Nama panggilan"
                className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <div className="grid gap-4">
                <select
                  required
                  value={profileForm.countryId}
                  onChange={(event) => {
                    const selected = countries.find(
                      (item) => item.id === event.target.value,
                    );
                    setProfileForm((prev) => ({
                      ...prev,
                      countryId: selected?.id ?? "",
                      countryName: selected?.name ?? "",
                      countryCode: selected?.code ?? "",
                      admin1Id: "",
                      admin1Name: "",
                      admin1Code: "",
                      cityId: "",
                      cityName: "",
                    }));
                    setAdmin1Options([]);
                    setCityOptions([]);
                    setPostalValid(false);
                    setPostalError(null);
                  }}
                  className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none"
                >
                  <option value="" disabled>
                    Pilih negara
                  </option>
                  {countries.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
              {profileForm.countryId && (
                <div className="grid gap-4">
                  <select
                    required
                    value={profileForm.admin1Id}
                    onChange={(event) => {
                      const selected = admin1Options.find(
                        (item) => item.id === event.target.value,
                      );
                      setProfileForm((prev) => ({
                        ...prev,
                        admin1Id: selected?.id ?? "",
                        admin1Name: selected?.name ?? "",
                        admin1Code: selected?.code ?? "",
                        cityId: "",
                        cityName: "",
                        postalCode: "",
                        addressDetail: "",
                      }));
                      setCityOptions([]);
                      setPostalValid(false);
                      setPostalError(null);
                    }}
                    className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none"
                  >
                    <option value="" disabled>
                      Provinsi / State
                    </option>
                    {admin1Options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {profileForm.admin1Id && (
                <div className="grid gap-4">
                  <select
                    required
                    value={profileForm.cityId}
                    onChange={(event) => {
                      const selected = cityOptions.find(
                        (item) => item.id === event.target.value,
                      );
                      setProfileForm((prev) => ({
                        ...prev,
                        cityId: selected?.id ?? "",
                        cityName: selected?.name ?? "",
                        postalCode: "",
                        addressDetail: "",
                      }));
                      setPostalValid(false);
                      setPostalError(null);
                    }}
                    className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none"
                  >
                    <option value="" disabled>
                      Kota
                    </option>
                    {cityOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {profileForm.cityId && (
                <div className="grid gap-4">
                  <input
                    type="text"
                    required
                    value={profileForm.postalCode}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        postalCode: event.target.value,
                        addressDetail: "",
                      }))
                    }
                    placeholder="Kode pos"
                    className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                </div>
              )}
              {profileForm.postalCode.trim() && (
                <div className="grid gap-4">
                  <input
                    type="text"
                    required
                    value={profileForm.addressDetail}
                    onChange={(event) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        addressDetail: event.target.value,
                      }))
                    }
                    placeholder="Alamat detail (jalan, RT/RW, dll)"
                    className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                </div>
              )}
              {postalLoading && (
                <p className="text-xs text-zinc-500">
                  Memverifikasi kode pos...
                </p>
              )}
              {postalError && (
                <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  {postalError}
                </p>
              )}
              {geoLoading && (
                <p className="text-xs text-zinc-500">Memuat data lokasi...</p>
              )}
              {geoError && (
                <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                  {geoError}
                </p>
              )}
              <div className="grid gap-4">
                <input
                  type="date"
                  required
                  value={profileForm.birthDate}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      birthDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none"
                />
                <select
                  required
                  value={profileForm.gender}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      gender: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-sm text-zinc-100 outline-none"
                >
                  <option value="" disabled>
                    Pilih jenis kelamin
                  </option>
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              {profileError && (
                <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {profileError}
                </p>
              )}

              <button
                type="submit"
                disabled={profileLoading}
                className="w-full rounded-full bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {profileLoading ? "Menyimpan..." : "Simpan & Lanjut"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-zinc-100">
      <div className="pointer-events-none absolute inset-0 zephyr-grid opacity-20" />
      <div
        className={`relative mx-auto flex min-h-screen w-full flex-col gap-10 px-6 ${
          isWide ? "max-w-none py-6 h-screen" : "max-w-6xl py-14"
        }`}
      >
        {!isWide && (
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-zinc-400">
                <span className="h-[1px] w-10 bg-zinc-700" />
                Groq Powered
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsWide((prev) => !prev)}
                  className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                  title={isWide ? "Lebar standar" : "Lebar penuh"}
                  aria-label={isWide ? "Lebar standar" : "Lebar penuh"}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
                  </svg>
                </button>
                <span className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-400">
                  {currentUser.email ?? "Akun aktif"}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  Keluar
                </button>
              </div>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Zephyr AI
            </h1>
            <p className="max-w-2xl text-base text-zinc-400 sm:text-lg">
              Chatbot gratis dengan kecepatan Groq. Tulis ide, pertanyaan, atau
              kebutuhan kontenmu, lalu biarkan Zephyr merespons dengan cepat.
            </p>
          </header>
        )}

        {isWide ? (
          <section className="relative flex w-full flex-1 gap-6">
            <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSummary(true)}
                className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white lg:hidden"
                title="Ringkasan"
                aria-label="Ringkasan"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsWide((prev) => !prev)}
                className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                title="Lebar standar"
                aria-label="Lebar standar"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 8h4V4M20 8h-4V4M4 16h4v4M20 16h-4v4" />
                </svg>
              </button>
              <span className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-400">
                {currentUser.email ?? "Akun aktif"}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-zinc-700/80 px-3 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Keluar
              </button>
            </div>
            <aside className="zephyr-panel hidden w-80 shrink-0 rounded-3xl p-6 sm:p-8 lg:block">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Ringkasan</h3>
                <span className="text-xs text-zinc-500">Status</span>
              </div>
              <div className="mt-6 space-y-4 text-sm text-zinc-400">
                {summaryCards}
              </div>
            </aside>
            <div className="flex-1">{chatPanel}</div>
            {showSummary && (
              <div className="fixed inset-0 z-20 bg-black/70 px-6 py-8 lg:hidden">
                <div className="zephyr-panel mx-auto w-full max-w-sm rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">
                      Ringkasan
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowSummary(false)}
                      className="rounded-full border border-zinc-700/80 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                      aria-label="Tutup ringkasan"
                    >
                      Tutup
                    </button>
                  </div>
                  <div className="mt-6 space-y-4 text-sm text-zinc-400">
                    {summaryCards}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            {chatPanel}
            <aside className="zephyr-panel rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Ringkasan</h3>
                <span className="text-xs text-zinc-500">Status</span>
              </div>
              <div className="mt-6 space-y-4 text-sm text-zinc-400">
                {summaryCards}
              </div>
            </aside>
          </section>
        )}
      </div>
    </div>
  );
}
