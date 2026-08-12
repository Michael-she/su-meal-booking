import { GoogleGenAI } from "@google/genai";

export type SupportedImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const SUPPORTED_MEDIA_TYPES: readonly SupportedImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export function isSupportedImageMediaType(mediaType: string): mediaType is SupportedImageMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

export interface ParsedMenu {
  facility: string;
  weekLabel: string;
  startDate: string;
  endDate: string;
  days: {
    date: string;
    dayName: string;
    meals: { breakfast: string[]; lunch: string[]; dinner: string[] };
  }[];
}

function isParsedMenu(x: unknown): x is ParsedMenu {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.facility === "string" &&
    typeof m.weekLabel === "string" &&
    typeof m.startDate === "string" &&
    typeof m.endDate === "string" &&
    Array.isArray(m.days) &&
    m.days.every((d) => {
      if (typeof d !== "object" || d === null) return false;
      const day = d as Record<string, unknown>;
      const meals = day.meals;
      return (
        typeof day.date === "string" &&
        typeof day.dayName === "string" &&
        typeof meals === "object" &&
        meals !== null &&
        Array.isArray((meals as Record<string, unknown>).breakfast) &&
        Array.isArray((meals as Record<string, unknown>).lunch) &&
        Array.isArray((meals as Record<string, unknown>).dinner)
      );
    })
  );
}

const MENU_JSON_SCHEMA = {
  type: "object",
  properties: {
    facility: {
      type: "string",
      description: 'Dining hall / facility name shown on the menu, e.g. "Helshoogte"',
    },
    weekLabel: {
      type: "string",
      description: 'The week heading text as shown, e.g. "Week 3 Winter Menu"',
    },
    startDate: { type: "string", description: "ISO 8601 date of the first day shown" },
    endDate: { type: "string", description: "ISO 8601 date of the last day shown" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "ISO 8601 date" },
          dayName: { type: "string", description: 'Weekday name as shown, e.g. "Monday"' },
          meals: {
            type: "object",
            properties: {
              breakfast: { type: "array", items: { type: "string" } },
              lunch: { type: "array", items: { type: "string" } },
              dinner: { type: "array", items: { type: "string" } },
            },
            required: ["breakfast", "lunch", "dinner"],
          },
        },
        required: ["date", "dayName", "meals"],
      },
    },
  },
  required: ["facility", "weekLabel", "startDate", "endDate", "days"],
};

const PROMPT = `This image is a weekly dining hall menu (a Stellenbosch University-style
weekly menu table). It has one column per day (with a day name and date) and rows
grouped by meal — Breakfast, Lunch, Dinner — with several food/item lines per cell.

Extract the menu into the given schema:
- facility: the dining hall/facility name printed on the menu.
- weekLabel: the week heading text as printed (e.g. "Week 3 Winter Menu").
- startDate / endDate: the date range shown, as ISO 8601 dates. Use the year printed
  on the menu.
- days: one entry per day column, left to right, each with the ISO date, the weekday
  name, and the breakfast/lunch/dinner items for that column.

Transcribe each food/item line from a cell as its own array entry, exactly as printed —
don't merge, invent, paraphrase, or omit items. If a cell is empty or illegible, use an
empty array for that meal.

Respond with only the JSON object, no other text.`;

/** Strips a ```json fence if the model wraps the output in one despite JSON mode. */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function parseMenuImage(
  base64Data: string,
  mediaType: SupportedImageMediaType
): Promise<ParsedMenu> {
  const client = new GoogleGenAI({});

  const interaction = await client.interactions.create({
    model: "gemini-3.6-flash",
    input: [
      { type: "text", text: PROMPT },
      { type: "image", data: base64Data, mime_type: mediaType },
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: MENU_JSON_SCHEMA,
    },
  });

  if (interaction.status !== "completed") {
    throw new Error(`Gemini did not complete the request (status: ${interaction.status}).`);
  }
  if (!interaction.output_text) {
    throw new Error("Gemini returned no text output.");
  }

  const parsed: unknown = JSON.parse(extractJson(interaction.output_text));
  if (!isParsedMenu(parsed)) {
    throw new Error("Gemini's response didn't match the expected menu shape.");
  }
  return parsed;
}
