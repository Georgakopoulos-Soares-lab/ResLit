import { db } from '@/lib/db/client'
import { amrGenes, amrMutations } from '@/lib/db/schema'
import type { FilterOptions } from '@/lib/types'
import { normalizeGeneName, pickGeneDisplayNames } from '@/lib/gene-name'

// Hand-rolled cache (matching lib/actions/browse.ts's tier caches) rather
// than unstable_cache: unstable_cache requires the Next.js incremental
// cache, which isn't available when instrumentation.ts pre-warms this at
// server boot — that call was silently failing, leaving this cache cold
// for whichever request happened to hit it first.
const CACHE_TTL_MS = 3600_000 // 1 hour
let _cache: { data: FilterOptions; ts: number } | null = null
let _inFlight: Promise<FilterOptions> | null = null

function sortedUnique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort()
}

/** One entry per gene identity ("OmpA"/"ompA" are one gene), shown under
 * its display name — the same spelling the browse pages use. */
function uniqueGeneNames(names: (string | null | undefined)[], display: Map<string, string>): string[] {
  return sortedUnique(names.filter((n): n is string => Boolean(n)).map((n) => display.get(normalizeGeneName(n)) ?? n))
}

async function _fetchFilterOptions(): Promise<FilterOptions> {
  const [geneRows, mutationRows] = await Promise.all([
    db
      .select({
        mechanism: amrGenes.mechanism,
        confersResistanceTo: amrGenes.confersResistanceTo,
        encodes: amrGenes.encodes,
        organismsTestedIn: amrGenes.organismsTestedIn,
        geographicLocation: amrGenes.geographicLocation,
        year: amrGenes.year,
        geneName: amrGenes.geneName,
        sourceDatabase: amrGenes.sourceDatabase,
      })
      .from(amrGenes),
    db
      .select({
        country: amrMutations.country,
        geneName: amrMutations.geneName,
        confersResistanceTo: amrMutations.confersResistanceTo,
        mutationType: amrMutations.mutationType,
        sourceDatabase: amrMutations.sourceDatabase,
      })
      .from(amrMutations),
  ])

  const geneDisplay = pickGeneDisplayNames(geneRows.map((r) => r.geneName), mutationRows.map((r) => r.geneName))
  const years = [...new Set(geneRows.map((r) => r.year).filter((y): y is number => y != null))].sort((a, b) => b - a)

  return {
    mechanismClasses: sortedUnique(geneRows.map((r) => r.mechanism)),
    antibiotics: sortedUnique(geneRows.flatMap((r) => r.confersResistanceTo || [])),
    encodes: sortedUnique(geneRows.map((r) => r.encodes)),
    organisms: sortedUnique(geneRows.map((r) => r.organismsTestedIn || []).flat()),
    countries: sortedUnique(geneRows.map((r) => r.geographicLocation)),
    mutationCountries: sortedUnique(mutationRows.map((r) => r.country)),
    years,
    geneNames: uniqueGeneNames(geneRows.map((r) => r.geneName), geneDisplay),
    mutationGeneNames: uniqueGeneNames(mutationRows.map((r) => r.geneName), geneDisplay),
    mutationAntibiotics: sortedUnique(mutationRows.flatMap((r) => r.confersResistanceTo || [])),
    mutationTypes: sortedUnique(mutationRows.map((r) => r.mutationType)),
    sourceDatabases: ['Card Database', 'Reference Gene Catalog', 'ResFinder Database', 'Reslit'],
  }
}

export async function getCachedFilterOptions(): Promise<FilterOptions> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.data
  }
  if (!_inFlight) {
    _inFlight = _fetchFilterOptions()
      .then((data) => {
        _cache = { data, ts: Date.now() }
        _inFlight = null
        return data
      })
      .catch((err) => {
        _inFlight = null
        throw err
      })
  }
  return _inFlight
}
