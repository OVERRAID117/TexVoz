import { NextResponse } from "next/server"
import TextToSpeech from "@google-cloud/text-to-speech"

function getClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 no está definida")

  const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"))

  return new TextToSpeech.TextToSpeechClient({ credentials })
}

export async function GET() {
  try {
    const client = getClient()

    const [result] = await client.listVoices({ languageCode: "es" })

    const voices =
      result.voices?.map((v) => ({
        name: v.name,
        languageCodes: v.languageCodes,
        gender: v.ssmlGender,
        sampleRate: v.naturalSampleRateHertz,
      })) || []

    return NextResponse.json({ voices })
  } catch (err: any) {
    console.error("[LIST VOICES ERROR]", err)
    return NextResponse.json(
      { error: err?.message || "Error listando voces" },
      { status: 500 }
    )
  }
}