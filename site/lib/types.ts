export type CurationStatus = 'pending' | 'curated' | 'rejected'

export type ValidationTier = 'Confirmed' | 'Established' | 'Supported' | 'Candidate'

export type ConfirmationReason = 'cross-database' | 'curator-verified' | 'both'

export interface ValidationInfo {
  tier: ValidationTier
  reason?: ConfirmationReason
  databases?: string[]
}

export type MutationType = 'substitution' | 'insertion' | 'deletion' | 'frameshift' | 'other'

export interface Paper {
  pmid: string
  title: string | null
  year: number | null
  paper_type: string | null
  key_findings: string | null
  methodology: string | null
  geographic_location: string[] | null
  sample_size: number | null
  created_at: string
  updated_at: string
}

export interface PaperSummary {
  title: string | null
  year: number | null
  key_findings: string | null
  geographic_location: string[] | null
}

export interface AMRGene {
  id: string
  gene_name: string
  allele: string | null
  encodes: string | null
  mechanism: string | null
  resistance_mechanism_class: string | null
  confers_resistance_to: string[] | null
  organisms_tested_in: string[] | null
  role_in_paper: string | null
  validation_method: string | null
  paper_pmid: string | null
  isolation_location: string | null
  isolation_country: string | null
  year: number | null
  pmid: string | null
  key_findings: string | null
  geographic_location: string | null
  title_pmid: string | null
  year_pmid: number | null
  source_database: string | null
  sequence_accession: string | null
  protein_accession: string | null
  notes: string | null
  status: CurationStatus
  gene_status: CurationStatus
  validation_tier?: ValidationTier
  created_at: string
  updated_at: string
  paper?: PaperSummary | null
}

export interface AMRMutation {
  id: string
  gene_name: string
  mutation_name: string | null
  notation: string | null
  nucleotide_change: string
  protein_change: string | null
  position_in_molecule: string | null
  wild_type: string | null
  mutant: string | null
  confers_resistance_to: string[] | null
  organisms_observed_in: string[] | null
  effect_on_function: string | null
  mutation_type: string | null
  validated_by: string | null
  origin: string | null
  paper_pmid: string | null
  key_findings: string | null
  country: string | null
  resistance_mechanism_class: string | null
  title_pmid: string | null
  year_pmid: number | null
  source_database: string | null
  status: CurationStatus
  validation_tier?: ValidationTier
  all_databases?: string[]
  gene_encodes?: string | null
  gene_mechanism?: string | null
  created_at: string
  updated_at: string
  gene?: {
    paper_pmid: string | null
    year: number | null
    paper?: PaperSummary | null
  } | null
}

export interface Curator {
  id: string
  email: string
  name: string | null
  affiliation: string | null
  created_at: string
  updated_at: string
}

export interface CurationNote {
  id: string
  target_type: 'gene' | 'mutation'
  target_id: string
  curator_id: string | null
  note: string
  created_at: string
  curator?: Curator
}

export interface CurationHistory {
  id: string
  target_type: 'gene' | 'mutation'
  target_id: string
  curator_id: string | null
  curator_name: string | null
  curator_email: string | null
  curator_affiliation: string | null
  action: 'approve' | 'reject' | 'edit' | 'create'
  previous_status: string | null
  new_status: string | null
  changes: Record<string, unknown> | null
  created_at: string
  curator?: Curator
}

export interface Comment {
  id: string
  target_type: 'gene' | 'mutation'
  target_id: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  content: string
  created_at: string
  updated_at: string
}

export interface PaperEntry {
  pmid: string
  title: string | null
  year: number | null
  geographic_location: string | null
  gene_count: number
  mutation_count: number
  antibiotics: string[]
  organisms: string[]
  source_database: string | null
}

export interface FilterOptions {
  mechanismClasses: string[]
  antibiotics: string[]
  encodes: string[]
  organisms: string[]
  countries: string[]
  mutationCountries: string[]
  years: number[]
  geneNames: string[]
  mutationGeneNames: string[]
  mutationAntibiotics: string[]
  mutationTypes: string[]
  sourceDatabases: string[]
}

export interface BrowseFilters {
  search?: string
  mechanismClass?: string
  antibiotic?: string
  encodes?: string
  organism?: string
  country?: string
  yearFrom?: number
  yearTo?: number
  status?: CurationStatus | 'all'
  curatedOnly?: boolean
  geneName?: string
  mutationType?: string
  sourceDatabases?: string[]
  pmid?: string
  validationTier?: ValidationTier
  geneNameSearch?: string
  alleleSearch?: string
}

export interface GeneWithMutationCount {
  gene_name: string
  mutation_count: number
  best_status: CurationStatus
  mutation_types: string[]
  resistances: string[]
  validation_tier?: ValidationTier
}

export interface PaginationParams {
  page: number
  pageSize: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
