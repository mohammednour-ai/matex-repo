import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  let body: { image_base64: string; media_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const { image_base64, media_type = "image/jpeg" } = body;
  if (!image_base64) {
    return NextResponse.json({ success: false, error: "image_base64 required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Dev fallback: return mock OCR data
    return NextResponse.json({
      success: true,
      data: {
        id_type: "drivers_license",
        first_name: "DEMO",
        last_name: "USER",
        id_number: "D1234-56789-00001",
        province_issued: "ON",
        expiry_date: "2028-12-31",
        dob: "1985-06-15",
        confidence: 0,
        dev_mode: true,
      },
    });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: image_base64 },
            },
            {
              type: "text",
              text: `Extract all personal information from this government-issued photo ID document.
Return ONLY a JSON object with these exact fields (use null for any field not visible or unclear):
{
  "id_type": "drivers_license|passport|health_card|status_card|other",
  "first_name": "string or null",
  "last_name": "string or null",
  "id_number": "string or null",
  "province_issued": "2-letter province code or null",
  "expiry_date": "YYYY-MM-DD or null",
  "dob": "YYYY-MM-DD or null",
  "address": "string or null",
  "confidence": 0.0-1.0 (your confidence in the extraction)
}
Do not include any explanation outside the JSON. If this is not an ID document, return {"error": "not_an_id", "confidence": 0}.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    let parsed: Record<string, unknown>;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "no_json", confidence: 0 };
    } catch {
      parsed = { error: "parse_failed", confidence: 0 };
    }

    if (parsed.error) {
      return NextResponse.json({ success: false, error: parsed.error as string });
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (err) {
    console.error("[OCR] Claude Vision error:", err);
    return NextResponse.json(
      { success: false, error: "OCR service temporarily unavailable" },
      { status: 503 },
    );
  }
}
