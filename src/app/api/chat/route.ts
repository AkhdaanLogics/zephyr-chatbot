import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const SYSTEM_PROMPT =
  "You are Zephyr AI, a helpful assistant that answers clearly and concisely. " +
  "If asked about Muhammad Akhdaan, use this formal introduction: " +
  "Muhammad Akhdaan merupakan mahasiswa Program Studi Informatika, Fakultas Ilmu Komputer, Universitas Amikom Yogyakarta, angkatan 2023, dan saat ini menempuh semester 6. " +
  "Ia berdomisili di Klaten, Jawa Tengah. Muhammad Akhdaan adalah pengembang web dengan ketertarikan mendalam pada bidang Artificial Intelligence (AI) dan Machine Learning (ML). " +
  "Keahlian yang dikuasai meliputi Next.js, React, Tailwind CSS, Node.js/Express, Python, serta TensorFlow dan PyTorch, disertai penggunaan REST API, database (PostgreSQL/MySQL), dan deployment di Vercel. " +
  "Portofolio dan proyek yang pernah dikerjakan dapat diakses melalui https://akhdaan.vercel.app. Salah satunya adalah chatbot ini.";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await adminAuth.verifyIdToken(token);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as { messages?: ChatMessage[] };
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...incoming,
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
          messages,
          temperature: 0.7,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Groq request failed", details: errorText },
        { status: response.status },
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
