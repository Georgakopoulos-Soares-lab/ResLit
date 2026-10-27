CREATE TABLE `curation_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`action` text NOT NULL,
	`changes` text,
	`note` text,
	`entry_label` text,
	`pmid` text,
	`curator_id` text,
	`curator_email` text,
	`curator_name` text,
	`curator_affiliation` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`admin_comment` text,
	`reviewed_by` text,
	`reviewed_by_name` text,
	`reviewed_at` text,
	`result` text,
	`applied_target_id` text,
	`legacy_history_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`curator_id`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `curators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `curation_proposals_target_idx` ON `curation_proposals` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `curation_proposals_status_idx` ON `curation_proposals` (`status`);--> statement-breakpoint
CREATE INDEX `curation_proposals_curator_idx` ON `curation_proposals` (`curator_id`);--> statement-breakpoint
-- Existing curator actions are re-queued as pending proposals for admin
-- review. Inserts into the new table only; amr_genes, amr_mutations and
-- curation_history are left exactly as they are.
INSERT INTO `curation_proposals` (
	`target_type`, `target_id`, `action`, `changes`, `entry_label`, `pmid`,
	`curator_id`, `curator_email`, `curator_name`, `curator_affiliation`,
	`status`, `legacy_history_id`, `created_at`, `updated_at`
)
SELECT
	h.`target_type`, h.`target_id`, h.`action`, h.`changes`,
	CASE h.`target_type`
		WHEN 'gene' THEN (SELECT coalesce(g.`allele`, g.`gene_name`) FROM `amr_genes` g WHERE g.`id` = CAST(h.`target_id` AS INTEGER))
		ELSE (SELECT m.`gene_name` || ' ' || coalesce(m.`protein_change`, m.`nucleotide_change`, m.`mutation_name`, '') FROM `amr_mutations` m WHERE m.`id` = CAST(h.`target_id` AS INTEGER))
	END,
	CASE h.`target_type`
		WHEN 'gene' THEN (SELECT coalesce(g.`paper_pmid`, g.`pmid`) FROM `amr_genes` g WHERE g.`id` = CAST(h.`target_id` AS INTEGER))
		ELSE (SELECT coalesce(m.`paper_pmid`, m.`pmid`) FROM `amr_mutations` m WHERE m.`id` = CAST(h.`target_id` AS INTEGER))
	END,
	h.`curator_id`, h.`curator_email`, h.`curator_name`, h.`curator_affiliation`,
	'pending', h.`id`, h.`created_at`, h.`created_at`
FROM `curation_history` h
ORDER BY h.`id`;
