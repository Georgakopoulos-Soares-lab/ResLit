CREATE TABLE `amr_genes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gene_name` text NOT NULL,
	`allele` text,
	`encodes` text,
	`mechanism` text,
	`resistance_mechanism_class` text,
	`confers_resistance_to` text,
	`organisms_tested_in` text,
	`role_in_paper` text,
	`validation_method` text,
	`paper_pmid` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`gene_status` text DEFAULT 'pending' NOT NULL,
	`isolation_country` text,
	`isolation_location` text,
	`year` integer,
	`pmid` text,
	`key_findings` text,
	`geographic_location` text,
	`title_pmid` text,
	`year_pmid` integer,
	`source_database` text,
	`sequence_accession` text,
	`protein_accession` text,
	`notes` text,
	`validated_by` text,
	`curator_name` text,
	`curator_email` text,
	`curator_affiliation` text,
	`validated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`paper_pmid`) REFERENCES `papers`(`pmid`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`validated_by`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `amr_genes_gene_name_idx` ON `amr_genes` (`gene_name`);--> statement-breakpoint
CREATE INDEX `amr_genes_status_idx` ON `amr_genes` (`status`);--> statement-breakpoint
CREATE INDEX `amr_genes_source_database_idx` ON `amr_genes` (`source_database`);--> statement-breakpoint
CREATE INDEX `amr_genes_paper_pmid_idx` ON `amr_genes` (`paper_pmid`);--> statement-breakpoint
CREATE INDEX `amr_genes_resistance_mechanism_class_idx` ON `amr_genes` (`resistance_mechanism_class`);--> statement-breakpoint
CREATE INDEX `amr_genes_validated_by_idx` ON `amr_genes` (`validated_by`);--> statement-breakpoint
CREATE TABLE `amr_mutations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gene_id` integer,
	`gene_name` text,
	`mutation_name` text,
	`notation` text,
	`nucleotide_change` text,
	`protein_change` text,
	`position_in_molecule` text,
	`position` integer,
	`wild_type` text,
	`mutant` text,
	`confers_resistance_to` text,
	`organisms_observed_in` text,
	`effect_on_function` text,
	`effect` text,
	`mutation_type` text,
	`validated_by` text,
	`origin` text,
	`country` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`paper_pmid` text,
	`pmid` text,
	`key_findings` text,
	`title_pmid` text,
	`year_pmid` integer,
	`resistance_mechanism_class` text,
	`source_database` text,
	`curator_name` text,
	`curator_email` text,
	`curator_affiliation` text,
	`validated_at` text,
	`gene_encodes` text,
	`gene_mechanism` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`gene_id`) REFERENCES `amr_genes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `amr_mutations_gene_name_idx` ON `amr_mutations` (`gene_name`);--> statement-breakpoint
CREATE INDEX `amr_mutations_gene_id_idx` ON `amr_mutations` (`gene_id`);--> statement-breakpoint
CREATE INDEX `amr_mutations_nucleotide_change_idx` ON `amr_mutations` (`nucleotide_change`);--> statement-breakpoint
CREATE INDEX `amr_mutations_status_idx` ON `amr_mutations` (`status`);--> statement-breakpoint
CREATE INDEX `amr_mutations_paper_pmid_idx` ON `amr_mutations` (`paper_pmid`);--> statement-breakpoint
CREATE INDEX `amr_mutations_source_database_idx` ON `amr_mutations` (`source_database`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text,
	`user_email` text,
	`user_name` text,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comments_target_idx` ON `comments` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `curation_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`curator_id` text,
	`curator_email` text,
	`curator_name` text,
	`curator_affiliation` text,
	`action` text NOT NULL,
	`previous_status` text,
	`new_status` text,
	`changes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`curator_id`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `curation_history_target_idx` ON `curation_history` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `curation_history_curator_idx` ON `curation_history` (`curator_id`);--> statement-breakpoint
CREATE TABLE `curation_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`curator_id` text,
	`curator_email` text,
	`curator_name` text,
	`curator_affiliation` text,
	`note` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`curator_id`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `curation_notes_target_idx` ON `curation_notes` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `curation_notes_curator_idx` ON `curation_notes` (`curator_id`);--> statement-breakpoint
CREATE TABLE `curators` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`affiliation` text,
	`institution` text,
	`role` text,
	`email_verified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `curators_email_idx` ON `curators` (`email`);--> statement-breakpoint
CREATE TABLE `papers` (
	`pmid` text PRIMARY KEY NOT NULL,
	`title` text,
	`year` integer,
	`paper_type` text,
	`key_findings` text,
	`methodology` text,
	`geographic_location` text,
	`sample_size` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`curator_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`curator_id`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_curator_idx` ON `sessions` (`curator_id`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`curator_id` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`curator_id`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `verification_tokens_curator_idx` ON `verification_tokens` (`curator_id`);