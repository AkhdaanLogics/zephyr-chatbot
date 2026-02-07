import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token } = (await req.json()) as { token?: string };
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing token" },
        { status: 400 },
      );
    }

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { success: false, error: "Missing TURNSTILE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const formData = new FormData();
    formData.append("secret", secret);
    formData.append("response", token);

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      },
    );

    const data = (await response.json()) as { success?: boolean };
    return NextResponse.json({ success: Boolean(data.success) });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 },
    );
  }
}
