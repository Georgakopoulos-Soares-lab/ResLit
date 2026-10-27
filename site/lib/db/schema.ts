import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

const isoNow = () => new Date().toISOString()

// ------------------------------------------------------------
// Curators + hand-rolled auth (sessions, verification/reset tokens)
// ------------------------------------------------------------

export const curators = sqliteTable(
  'curators',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    affiliation: text('affiliation'),
    institution: text('institution'), // legacy alias, some UI falls back to this
    role: text('role'), // e.g. 'admin' — most curators have null (plain curator)
    emailVerifiedAt: text('email_verified_at'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
  },
  (t) => [uniqueIndex('curators_email_idx').on(t.email)]
)

/** Safe-to-return projection of curators — deliberately excludes passwordHash
 * and emailVerifiedAt. Use this (never the bare `curators` table) whenever a
 * curator row is joined into a result that could reach app/client code. */
export const publicCuratorColumns = {
  id: curators.id,
  email: curators.email,
  name: curators.name,
  affiliation: curators.affiliation,
  institution: curators.institution,
  role: curators.role,
  created_at: curators.createdAt,
  updated_at: curators.updatedAt,
} as const

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    curatorId: text('curator_id').notNull().references(() => curators.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('sessions_curator_idx').on(t.curatorId)]
)

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    curatorId: text('curator_id').notNull().references(() => curators.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['verify', 'reset'] }).notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [index('verification_tokens_curator_idx').on(t.curatorId)]
)

// ------------------------------------------------------------
// Papers
// ------------------------------------------------------------

export const papers = sqliteTable('papers', {
  pmid: text('pmid').primaryKey(),
  title: text('title'),
  year: integer('year'),
  paperType: text('paper_type'),
  keyFindings: text('key_findings'),
  methodology: text('methodology'),
  geographicLocation: text('geographic_location', { mode: 'json' }).$type<string[] | null>(),
  sampleSize: integer('sample_size'),
  createdAt: text('created_at').notNull().$defaultFn(isoNow),
  updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
})

// ------------------------------------------------------------
// AMR genes
// ------------------------------------------------------------

export const amrGenes = sqliteTable(
  'amr_genes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    geneName: text('gene_name').notNull(),
    allele: text('allele'),
    encodes: text('encodes'),
    mechanism: text('mechanism'),
    resistanceMechanismClass: text('resistance_mechanism_class'),
    confersResistanceTo: text('confers_resistance_to', { mode: 'json' }).$type<string[] | null>(),
    organismsTestedIn: text('organisms_tested_in', { mode: 'json' }).$type<string[] | null>(),
    roleInPaper: text('role_in_paper'),
    validationMethod: text('validation_method'),
    paperPmid: text('paper_pmid').references(() => papers.pmid, { onDelete: 'set null' }),
    status: text('status', { enum: ['pending', 'curated', 'rejected'] }).notNull().default('pending'),
    geneStatus: text('gene_status', { enum: ['pending', 'curated', 'rejected'] }).notNull().default('pending'),
    isolationCountry: text('isolation_country'),
    isolationLocation: text('isolation_location'),
    year: integer('year'),
    pmid: text('pmid'),
    keyFindings: text('key_findings'),
    geographicLocation: text('geographic_location'), // scalar (denormalized from paper) — NOT an array, unlike papers.geographic_location
    titlePmid: text('title_pmid'),
    paperType: text('paper_type'),
    yearPmid: integer('year_pmid'),
    sourceDatabase: text('source_database'),
    sequenceAccession: text('sequence_accession'),
    proteinAccession: text('protein_accession'),
    notes: text('notes'),
    validatedBy: text('validated_by').references(() => curators.id, { onDelete: 'set null' }),
    curatorName: text('curator_name'),
    curatorEmail: text('curator_email'),
    curatorAffiliation: text('curator_affiliation'),
    validatedAt: text('validated_at'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
  },
  (t) => [
    index('amr_genes_gene_name_idx').on(t.geneName),
    index('amr_genes_status_idx').on(t.status),
    index('amr_genes_source_database_idx').on(t.sourceDatabase),
    index('amr_genes_paper_pmid_idx').on(t.paperPmid),
    index('amr_genes_resistance_mechanism_class_idx').on(t.resistanceMechanismClass),
    index('amr_genes_validated_by_idx').on(t.validatedBy),
  ]
)

// ------------------------------------------------------------
// AMR mutations
// ------------------------------------------------------------

export const amrMutations = sqliteTable(
  'amr_mutations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    geneId: integer('gene_id').references(() => amrGenes.id, { onDelete: 'cascade' }),
    geneName: text('gene_name'),
    mutationName: text('mutation_name'),
    notation: text('notation'),
    nucleotideChange: text('nucleotide_change'),
    proteinChange: text('protein_change'),
    positionInMolecule: text('position_in_molecule'),
    position: integer('position'),
    wildType: text('wild_type'),
    mutant: text('mutant'),
    confersResistanceTo: text('confers_resistance_to', { mode: 'json' }).$type<string[] | null>(),
    organismsObservedIn: text('organisms_observed_in', { mode: 'json' }).$type<string[] | null>(),
    effectOnFunction: text('effect_on_function'),
    effect: text('effect'),
    mutationType: text('mutation_type', {
      enum: ['substitution', 'insertion', 'deletion', 'frameshift', 'other'],
    }),
    // Overloaded in the live app: holds a free-text validation-method string from CSV
    // imports (e.g. "cloning in E. coli + MIC testing") OR a curator id once a curator
    // approves/rejects the mutation (lib/actions/curator.ts). Not a strict FK because
    // of the mixed content — preserved as-is from the original schema, not "fixed" here.
    validatedBy: text('validated_by'),
    origin: text('origin'),
    country: text('country'),
    status: text('status', { enum: ['pending', 'curated', 'rejected'] }).notNull().default('pending'),
    paperPmid: text('paper_pmid'),
    pmid: text('pmid'),
    keyFindings: text('key_findings'),
    titlePmid: text('title_pmid'),
    paperType: text('paper_type'),
    yearPmid: integer('year_pmid'),
    resistanceMechanismClass: text('resistance_mechanism_class'),
    sourceDatabase: text('source_database'),
    curatorName: text('curator_name'),
    curatorEmail: text('curator_email'),
    curatorAffiliation: text('curator_affiliation'),
    validatedAt: text('validated_at'),
    geneEncodes: text('gene_encodes'),
    geneMechanism: text('gene_mechanism'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
  },
  (t) => [
    index('amr_mutations_gene_name_idx').on(t.geneName),
    index('amr_mutations_gene_id_idx').on(t.geneId),
    index('amr_mutations_nucleotide_change_idx').on(t.nucleotideChange),
    index('amr_mutations_status_idx').on(t.status),
    index('amr_mutations_paper_pmid_idx').on(t.paperPmid),
    index('amr_mutations_source_database_idx').on(t.sourceDatabase),
  ]
)

// ------------------------------------------------------------
// Comments (public annotations on genes/mutations)
// ------------------------------------------------------------

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    targetType: text('target_type', { enum: ['gene', 'mutation'] }).notNull(),
    targetId: text('target_id').notNull(),
    userId: text('user_id').references(() => curators.id, { onDelete: 'set null' }),
    userEmail: text('user_email'),
    userName: text('user_name'),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
  },
  (t) => [index('comments_target_idx').on(t.targetType, t.targetId)]
)

// ------------------------------------------------------------
// Curation tracking (history + notes)
// ------------------------------------------------------------

export const curationHistory = sqliteTable(
  'curation_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['gene', 'mutation'] }).notNull(),
    targetId: text('target_id').notNull(),
    curatorId: text('curator_id').references(() => curators.id, { onDelete: 'set null' }),
    curatorEmail: text('curator_email'),
    curatorName: text('curator_name'),
    curatorAffiliation: text('curator_affiliation'),
    action: text('action', { enum: ['approve', 'reject', 'edit', 'create'] }).notNull(),
    previousStatus: text('previous_status'),
    newStatus: text('new_status'),
    changes: text('changes', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
  },
  (t) => [
    index('curation_history_target_idx').on(t.targetType, t.targetId),
    index('curation_history_curator_idx').on(t.curatorId),
  ]
)

export const curationNotes = sqliteTable(
  'curation_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['gene', 'mutation'] }).notNull(),
    targetId: text('target_id').notNull(),
    curatorId: text('curator_id').references(() => curators.id, { onDelete: 'set null' }),
    curatorEmail: text('curator_email'),
    curatorName: text('curator_name'),
    curatorAffiliation: text('curator_affiliation'),
    note: text('note').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
  },
  (t) => [
    index('curation_notes_target_idx').on(t.targetType, t.targetId),
    index('curation_notes_curator_idx').on(t.curatorId),
  ]
)

// ------------------------------------------------------------
// Curation proposals (propose-then-validate)
//
// Every curator action (edit, reassign, approve, reject, upload/import) is
// stored here as a pending proposal and leaves amr_genes / amr_mutations
// untouched. Only an admin accepting a proposal applies it
// (lib/curation/proposals.ts). curation_history is kept as a legacy
// archive; its rows were copied in here as pending by migration 0002.
// ------------------------------------------------------------

export const curationProposals = sqliteTable(
  'curation_proposals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['gene', 'mutation'] }).notNull(),
    // null for 'create' proposals until accepted (then see appliedTargetId)
    targetId: text('target_id'),
    action: text('action', { enum: ['edit', 'reassign', 'approve', 'reject', 'create'] }).notNull(),
    // edit/reassign: { field: { old, new } } (camelCase column keys)
    // approve/reject: { gene_name, allele }
    // create: { values: <insert values>, paper?: <paper upsert>, resolveGeneName?: string }
    changes: text('changes', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    note: text('note'),
    // Snapshots taken when the proposal is made, so the review page still
    // makes sense if the entry changes later.
    entryLabel: text('entry_label'),
    pmid: text('pmid'),
    curatorId: text('curator_id').references(() => curators.id, { onDelete: 'set null' }),
    curatorEmail: text('curator_email'),
    curatorName: text('curator_name'),
    curatorAffiliation: text('curator_affiliation'),
    status: text('status', { enum: ['pending', 'accepted', 'declined'] }).notNull().default('pending'),
    adminComment: text('admin_comment'),
    reviewedBy: text('reviewed_by').references(() => curators.id, { onDelete: 'set null' }),
    reviewedByName: text('reviewed_by_name'),
    reviewedAt: text('reviewed_at'),
    // Outcome recorded on accept: { previous_tier, new_tier, previous_status, new_status }
    result: text('result', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    appliedTargetId: text('applied_target_id'),
    legacyHistoryId: integer('legacy_history_id'),
    createdAt: text('created_at').notNull().$defaultFn(isoNow),
    updatedAt: text('updated_at').notNull().$defaultFn(isoNow).$onUpdate(isoNow),
  },
  (t) => [
    index('curation_proposals_target_idx').on(t.targetType, t.targetId),
    index('curation_proposals_status_idx').on(t.status),
    index('curation_proposals_curator_idx').on(t.curatorId),
  ]
)
