# Zephyr AI

Chatbot gratis bernama Zephyr AI yang terhubung ke Groq API dan siap dideploy ke Vercel.

## Konfigurasi Environment

Buat file `.env.local` dan isi dengan API key Groq:

```
GROQ_API_KEY=isi_api_key_kamu
GROQ_MODEL=llama-3.3-70b-versatile
```

Tambahkan konfigurasi Firebase:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_CSC_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

## Menjalankan Lokal

```
npm install
npm run dev
```

## Catatan

- Endpoint backend: `POST /api/chat`
- Frontend ada di `src/app/page.tsx`
