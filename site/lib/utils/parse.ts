import type { Qwen3PaperJson } from "@/lib/actions/import"

// ------------------------------------------------------------
// parseQwen3Text
// Parses a QWEN3 extraction log or raw JSON into an array of Qwen3PaperJson
// ------------------------------------------------------------
export function parseQwen3Text(text: string): Qwen3PaperJson[] {
  const trimmed = text.trim()

  // 1. Try direct JSON parse (single object or array)
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed as Qwen3PaperJson[]
    }
    return [parsed as Qwen3PaperJson]
  } catch {
    // fall through to log-file parsing
  }

  // 2. Log file parsing:
  //    Split on "📋 EXTRACTED JSON:" marker, then find content between
  //    pairs of separator lines (10+ dashes)
  const results: Qwen3PaperJson[] = []
  const separatorRegex = /^-{10,}/

  const sections = text.split("📋 EXTRACTED JSON:")
  // sections[0] is everything before the first marker; skip it
  for (let s = 1; s < sections.length; s++) {
    const section = sections[s]
    const lines = section.split("\n")

    // Find the first separator line
    let startIdx = -1
    let endIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (separatorRegex.test(lines[i].trim())) {
        if (startIdx === -1) {
          startIdx = i
        } else {
          endIdx = i
          break
        }
      }
    }

    if (startIdx === -1) continue

    // Content is between the two separator lines
    const contentLines =
      endIdx !== -1
        ? lines.slice(startIdx + 1, endIdx)
        : lines.slice(startIdx + 1)

    const jsonStr = contentLines.join("\n").trim()
    if (!jsonStr) continue

    try {
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) {
        results.push(...(parsed as Qwen3PaperJson[]))
      } else {
        results.push(parsed as Qwen3PaperJson)
      }
    } catch {
      // Skip malformed JSON blocks
    }
  }

  return results
}

// ------------------------------------------------------------
// parseCSV
// Parses CSV text into an array of records
// ------------------------------------------------------------
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/["\s]/g, "_"))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = values[j] || ""
    })
    rows.push(row)
  }

  return rows
}

// ------------------------------------------------------------
// parseJSON
// Parses JSON text into an array of records
// ------------------------------------------------------------
export function parseJSON(jsonText: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      return parsed
    }
    return [parsed]
  } catch {
    return []
  }
}
