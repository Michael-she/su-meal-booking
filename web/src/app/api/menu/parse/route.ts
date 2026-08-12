import { NextResponse } from "next/server";
import { isSupportedImageMediaType, parseMenuImage } from "@/lib/menuVisionClient";
import { saveMenu } from "@/lib/menuStore";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }
    if (!isSupportedImageMediaType(file.type)) {
      return NextResponse.json(
        { error: `Unsupported image type "${file.type}". Use JPEG, PNG, GIF, or WebP.` },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64Data = bytes.toString("base64");

    const parsed = await parseMenuImage(base64Data, file.type);
    const saved = await saveMenu(parsed);

    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
