README_harmonization.txt
=========================
How the four harmonized CSVs that seed the genes/mutations database were built.

Seed files (consumed by scripts/seed-sqlite.mjs, run via `pnpm db:seed`):
  - Full_list_genes_Reslit_harmonized_antib_bact.csv                                    (Pipeline A, genes)
  - Full_list_mutations_Reslit_antib_bact.csv                                            (Pipeline A, mutations)
  - Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv (Pipeline B, genes)
  - Full_list_mutations_otherDatabases_clean.csv                                         (Pipeline B, mutations)

There are two independent pipelines, both rooted at this directory
(/home/argis/Desktop/austin/reslit/site/paper/). They converge only at the very end,
in scripts/seed-sqlite.mjs (in the webapp repo), which loads all four files into SQLite.

  Pipeline A ("Reslit")        — your own extraction pipeline: papers -> LLM extraction -> cleaning
  Pipeline B ("other databases") — CARD / ResFinder / NCBI Reference Gene Catalog / AMRFinder

The "other databases" files exist so genes/mutations independently reported outside
Pipeline A can be marked "Confirmed"/"Established" in the app instead of capped at
"Supported"/"Candidate" (see lib/actions/browse.ts EXTERNAL_DATABASES, and the seed
script's normalization of source-database labels).

All paths below are relative to this directory unless given in full.


=====================================================================
PIPELINE A — RESLIT (own extraction pipeline)
=====================================================================

A1. Paper acquisition — pubmed_fetch.ipynb
-------------------------------------------
Lives at ../site/site/site/scripts/pubmed_fetch.ipynb (in the webapp repo scripts dir).
Finds PMIDs only — does not download full text.

  - fetch_pmids_recursive() calls NCBI esearch.fcgi with a rate limit and exponential
    backoff, and recursively splits any query that exceeds the 9,999-hit esearch cap,
    first by month then by day, so no hits are lost to pagination limits.
  - Runs across year_range = (1960, 2025) with ~60 hand-curated PubMed queries combining
    MeSH terms (Drug Resistance, Microbial[mh]; organism MeSH; drug-class MeSH) and
    free-text patterns (gyrA/parC/rpoB mutation phrasing, "resistance mechanism", "MIC").
  - Output: a deduplicated PMID list (amr_pmids_genetics2.txt / .csv) — the seed list the
    classifier notebook consumes.

A2. Relevance triage — reslit_classifier.ipynb
------------------------------------------------
Also in ../site/site/site/scripts/. Two-stage filter before any LLM is invoked:

  1. PubTator3 bulk NER index — downloads NCBI's PubTator3 gene/mutation/species/chemical/
     relation annotation dumps (~3.3GB) and indexes them in DuckDB (has_gene, has_mutation,
     has_chemical, has_species, has_hv_relation flags per PMID).
  2. Entrez metadata fetch — pulls each PMID's abstract, MeSH terms, substances, pub types,
     language, etc. via Entrez.efetch into a SQLite table.
  3. Four-signal classifier (classify_paper) — a paper passes if it satisfies any of:
       - (gene|mutation) + chemical co-mention (PubTator)
       - MeSH resistance-mechanism + drug pairing
       - MeSH genetics-subheading + AMR-substance
       - PubTator species + AMR MeSH + drug MeSH
     Everything else is dropped as "no_signal".
  4. Cleanup pass drops non-English papers and papers whose MeSH indicates a non-bacterial
     organism, writing audit files removed_non_english.txt / removed_wrong_organism.txt.

A3. LLM extraction — Qwen3-30B-A3B, batches 1-6
--------------------------------------------------
NOTE: the extraction driver itself (prompts/chunking code) is NOT present in this
checkout — only its JSON output and the converters that turn it into CSV.

extraction_summary_batch1.json ... batch6.json (~40-49MB each) headers record:
    "model": "Qwen/Qwen3-30B-A3B"
    "audit_enabled": true                (a self-review pass)
    "extraction_mode": "direct"|"chunked" (per paper)

Each paper's structured output carries parallel genes:{...} and mutations:{...}
sub-objects — one LLM pass extracted both gene-level and mutation-level records
per paper.

Across the six batches: 117,112 papers processed, ~64,276 successful extractions,
~125,963 total gene mentions before any cleaning.

Converters (invoked once per batch — see bash_commands_for_genes.sh / bash_commands_for_mutations.sh):

    python qwen3_to_csv.py extraction_summary_batchN.json genes_batchN.csv
    python qwen3_mutations_to_csv.py extraction_summary_batchN.json mutations_batchN.csv

qwen3_to_csv.py (843 lines) does real work beyond JSON flattening:
  - fixes missing "bla" prefixes and AME prime-mark notation
  - maps raw gene/allele strings to canonical RGC-style names via allele_geneFamily.txt
    (its own comments flag the prefix-match fallback as "aggressive"/risky, affecting
    ~3,205 rows / 516 unique mappings)
  - filters out locus-tag garbage, hallucinated repeated-character strings, and
    non-bacterial gene names (checked against Bacteria_genes_all.txt)

qwen3_mutations_to_csv.py (1,295 lines) does the mutation-side equivalent, including:
  - a real bug fix in-repo: the hallucination regex (.){3,} (matched almost anything)
    was corrected to a backreference-based repeated-character check (.)\1{3,}
  - non-coding-RNA special-casing (16S/23S/rrs/rrl)
  - compound-mutation expansion ("A90V + D94G" -> two rows)
  - requires a recognized antibiotic in confers_resistance_to unless the mutation is a
    promoter mutation (negative position)

Earlier prototype runs exist and are SUPERSEDED, not part of the reproducible chain
(none are referenced by the bash scripts):
  - old/extraction_summary_1500papers.json (1,430 papers) -> old/genes.csv
  - extraction_summary.json at root (1,596 papers)
  - text_50000/ directory (batch_1/2/3, ~1.4k/18.8k/18.8k papers)
  - genes.csv, genes_1500.csv at root (predate the batch1-6 run)
  - genes_all_normalised.csv, genes_all_normalised_experimentally_characterized.csv
    (abandoned parallel attempt; no script references either filename)

A4. Gene post-processing chain
---------------------------------
Exact commands, in order, from bash_commands_for_genes.sh:

 1. qwen3_to_csv.py x6                                        LLM JSON -> per-batch CSV (see A3)

 2. awk 'FNR==1 && NR!=1 {next} {print}' genes_batch{1..6}.csv > genes_all.csv
        Concatenate 6 batches, keeping one header (~108,694 rows)

 3. cat genes_all.csv | grep "experimentally_characterized" > genes_all_experimentally_characterized.csv
        Keep only rows whose evidence level says experimentally characterized (~60,150 rows)

 4. head -n 1 genes_all.csv > header.csv
    cat header.csv genes_all_experimentally_characterized.csv > genes_all_experimental_characterized.csv
        Re-attach the header lost by the grep in step 3

 5. inline `python3 - <<'EOF' ... EOF` heredoc (pandas)
        Adds a gene_name_normalised column right after gene_name — a LIGHT lexical fold
        (lowercase, strip prime/quote characters: ' ' ' ' ` ' " ' " ), distinct from the
        heavier canonicalization already done in step 1.
        Writes normalised_genes_all_experimental_characterized.csv

 6. awk -v FPAT='([^,]*)|("([^"]|"")*")' 'NR == 1 || ($2 != "" && $2 != "\"\"")' \
        normalised_genes_all_experimental_characterized.csv > normalised_genes_all_experimental_characterized_full.csv
        Drops rows with an empty paper_title (field-aware AWK, handles quoted commas)

 7. awk '{sub(/\r$/, ""); if (NR==1) print $0 ",Database"; else print $0 ",Reslit"}' \
        normalised_genes_all_experimental_characterized_full.csv > normalised_genes_all_experimental_characterized_full_final.csv
        Appends a literal Database column populated with "Reslit" on every row

 8. python build_reslit_genes.py
        Renames/selects columns into the final schema:
        Database, Gene, Allele, Encodes, Mechanism, Resistance, Organism,
        Sequence_accession, Protein_accession, Validation_method, PMID,
        Paper_title, Publication_year, Key_findings, Geographic_location, Notes
        (Gene <- gene_name_normalised, Allele <- allele, Protein_accession always empty)
        --> Full_list_genes_Reslit.csv   (57,153 rows)

 9. python other_databases/comparison/genes/harmonize_names.py
        HARMONIZATION step — see A6 below
        --> Full_list_genes_Reslit_harmonized.csv

10. python3 fix_gene_capitalization_genes.py
        Rewrites file in place. Two passes, in order (the first pass was added later,
        see below and A6a):

        Pass 1 (frequency-based self-consistency, harmonize_allele_gene_by_frequency()):
        Groups rows by Allele reduced to letters+digits only, lowercase — so "blaOXA-10",
        "blaoxa10", and "blaoxa − 10" (any dash/space/quote variant) all collapse to the
        same key "blaoxa10" — and rewrites every row in a group to that group's most
        frequent exact Allele spelling, and its most frequent exact Gene spelling. Groups
        with a different key (genuinely different letters/numbers) are never merged.
        Result of the actual run: 1,007 Allele groups had spelling variants; 7,001 Allele
        values rewritten; 1,493 Gene values rewritten; unique Gene spellings dropped from
        3,716 to 3,419 (fewer near-duplicate variants, e.g. blaOXA-48/bla_OXA-48/
        bla(OXA-48)/blaOXA48/blaOXA−48 -> blaOXA-48 with Gene blaOXA). Known limitation:
        for "-like" homolog entries (e.g. blaOXA-23-like), the Gene column was lowercase
        in 100% of that group's source rows with no capitalized variant anywhere to vote
        for, so those Gene values stay lowercase even though Allele got fixed — frequency
        voting can't recover a spelling that never occurs in the data.

        Pass 2 (reference-based, unchanged from before): matches Gene against
        Bacteria_genes_all.txt (lowercase + strip prime/quote characters on both sides);
        where matched, replaces with the reference's original capitalization. After pass 1
        reduced the unique-gene count to 3,419, this pass matched 2,583/3,419. Unmatched
        names captured (via shell redirection) into unmatched_genes_reslit_harmonized.txt.
        (Pre-pass-1 baseline, for reference: 1,419/3,716 matched.)

11. python3 clean_organism_resistance.py
        ANTIB_BACT FILTERING step — see A7 below
        --> Full_list_genes_Reslit_harmonized_antib_bact.csv   (54,181 rows)  *** SEED FILE ***
        (was 54,175 rows before step 10's pass 1 was added; clean_organism_resistance.py
        has no dependency on Gene/Allele, so this tiny shift is incidental, not caused by
        the gene/allele fix itself — see A7.)

A5. Mutation post-processing chain
--------------------------------------
Exact commands, in order, from bash_commands_for_mutations.sh:

 1. qwen3_mutations_to_csv.py x6                               LLM JSON -> per-batch CSV

 2. head -1 mutations_batch1.csv > mutations_all.csv && tail -n +2 -q mutations_batch*.csv >> mutations_all.csv
        Concatenate 6 batches, one header (~24,039 rows)

 3. python3 enrich_database_metadata.py mutations_all.csv mutations_all_enriched.csv --email skulakis@gmail.com
        For rows with a PMID but missing title/year: fetches via Entrez.esummary.
        For rows with NO PMID: resolves one by searching PubMed on the row's first
        sequence_accessions value (GenBank accession), then fetches title/year for the
        recovered PMID. Rows already complete are left untouched.
        CLI: input, output, --email (default reslit@example.com), --api-key (optional).

 4. inline csv.DictReader/DictWriter filter (documented in the bash script, not saved
    as its own .py file):
        Keeps only rows where normalised_gene_mutation or normalised_protein_change is
        non-empty --> mutations_all_final.csv

 5. second cleanup pass (documented in prose in the bash script; exact code not preserved):
        Removes rows with "?" in normalised_protein_change/nucleotide change, canonicalizes
        various "rss+something" -> "rrs", drops rrs rows mislabeled "23s" and rrl rows
        mislabeled "50s", restricts to rows with a reported microorganism
        --> mutations_all_final_organisms.csv

 6. python build_reslit_mutations.py
        Maps to final schema:
        Database, Nucleotide_Change, Protein_Change, Gene, Encodes, Mechanism,
        Resistance, Organism, Validated_by, Notes, Accession_number, PMID,
        Paper_title, Publication_year, Origin
        (Accession_number always empty; organisms_observed_in is pipe-split and EACH
        organism becomes its own output row — split_organisms())
        --> Full_list_mutations_Reslit.csv   (26,148 rows)

 7. python3 fix_gene_capitalization_reslit.py
        Capitalization fix against Bacteria_genes_all.txt (in place).
        211 / 1,180 unique gene names corrected. NOTE: mutations get NO separate
        cross-database "harmonized" step — only this capitalization fix, unlike genes.
        Unmatched names captured into unmatched_genes_reslit.txt (180 lines).

 8. python clean_mutations.py
        ANTIB_BACT FILTERING step — see A7 below
        --> Full_list_mutations_Reslit_antib_bact.csv   (26,094 rows)  *** SEED FILE ***

A6. What "harmonized" means
-------------------------------
Only the GENES file gets this step; mutations skip it.

other_databases/comparison/genes/harmonize_names.py treats the OTHER-DATABASES combined
file as the canonical naming reference and rewrites the Reslit file to match its
capitalization:
  - normalize_gene_name(name): lowercases, strips whitespace, removes prime/quote
    characters (no allele-suffix stripping, no synonym table — a pure character-fold).
  - Builds gene_map: normalized-gene -> most frequent original-case spelling seen in
    Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv
  - Builds allele_map: (normalized_gene, normalized_allele) -> most frequent original-
    case allele spelling, same source.
  - Rewrites every Reslit row's Gene/Allele to that other-databases casing wherever a
    normalized match exists.

In effect: "harmonized" = conform Reslit's gene/allele CAPITALIZATION to whatever casing
convention the CARD/ResFinder/NCBI combined file uses. This is a cosmetic/capitalization
harmonization only — no rows are added, dropped, or content-transformed.

Input:  comparison/genes/Full_list_genes_Reslit.csv (also written back to, in place)
Reference (read-only): comparison/genes/Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv
Output: Full_list_genes_Reslit_harmonized.csv (written to both the comparison/genes/ copy
        and the root copy, md5-identical)

This script is invoked FROM the Reslit build pipeline (bash_commands_for_genes.sh, step 9)
— it is not called by anything in the other-databases build scripts themselves.

A6a. Frequency-based Allele/Gene self-consistency fix (added after initial harmonization)
----------------------------------------------------------------------------------------------
Added as a first pass inside fix_gene_capitalization_genes.py (A4 step 10), run on
Full_list_genes_Reslit_harmonized.csv AFTER the A6 cross-database harmonization and
BEFORE the Bacteria_genes_all.txt reference-based fix. Unlike A6 (which harmonizes
against an external reference file) and the reference-based pass (also external), this
pass is purely internal/self-consistency-based — no external file involved:

  - loose_key(name): keep only letters and digits, lowercase everything else stripped
    (drops spaces, hyphens, underscores, parentheses, unicode minus/en-dash/em-dash
    characters, quote marks, etc). E.g. "blaOXA-10", "blaoxa10", "bla_OXA-10", and
    "blaoxa − 10" (unicode minus) all reduce to "blaoxa10".
  - Rows are grouped by loose_key(Allele). Rows with an empty/NaN Allele are excluded
    from grouping and left untouched.
  - Within each group of >=2 rows: the group's Allele is rewritten to whichever exact
    Allele spelling occurs most often in that group (majority vote), and, separately,
    the group's Gene is rewritten to whichever exact Gene spelling occurs most often in
    that group. A group is only touched where there is actual spelling variation to
    resolve — a group where every row already agrees is left alone.
  - Groups with different loose keys (i.e. genuinely different letters/numbers) are
    never merged with each other — only exact-loose-key matches are pooled.

This directly targets extraction/formatting noise that A6 and the reference-based fix
don't catch, since neither of those strips punctuation/whitespace: things like
"blaKPC-2" vs "bla(KPC-2)" vs "blaKPC−2" (unicode minus) vs "bla_KPC-2" vs "blaKPC2"
were previously four-to-five distinct strings passing through the rest of the pipeline
as if they were different alleles.

Script: fix_gene_capitalization_genes.py, function harmonize_allele_gene_by_frequency()
Input/Output: Full_list_genes_Reslit_harmonized.csv (in place, same file as A6's output)
Before running: back a copy up first (Full_list_genes_Reslit_harmonized.csv is also A6's
output and A7's input) -- e.g. cp Full_list_genes_Reslit_harmonized.csv
Full_list_genes_Reslit_harmonized.csv.bak_before_freq_harmonize
Verified run results: 1,007 Allele groups had spelling variants; 7,001 Allele values
rewritten; 1,493 Gene values rewritten; unique Gene spellings 3,716 -> 3,419. See A4
step 10 for concrete before/after examples and the known "-like" limitation.

A7. What "antib_bact" filtering means
-----------------------------------------
clean_organism_resistance.py (genes) and clean_mutations.py (mutations — imports and
reuses the former's load_species / load_antibiotics / clean_organism / clean_resistance /
resolve_antibiotic functions):

  - Organism column: each pipe-separated entry checked against available_species.txt
    (genus+species matching, plus a hardcoded _EXTRA_VALID_ORGANISMS set of higher-taxon
    names, common-name groups like "coagulase-negative staphylococci", host terms, and
    select fungi). Non-matching tokens dropped from the cell (cell can end up empty; row
    is NOT dropped just for this, on the genes side).

  - Resistance column: each entry checked against antibiotics_names.txt +
    antibiotics_names_abreviations.txt, with plural/hyphen/slash normalization and dedup.
    Non-antibiotic tokens dropped.

  - Row drop rule: rows left with an empty Resistance column are dropped.
      * Genes: 54,181 rows remain (from 57,116 harmonized input — 2,935 rows dropped
        for lacking a recognized antibiotic; verified after the A6a frequency-based
        Allele/Gene fix was added — clean_organism_resistance.py has no dependency on
        Gene/Allele at all, so this count is effectively unaffected by that fix; the
        small change from the earlier ~2,941 estimate reflects that the original figure
        was an approximation, not a real shift).
      * Mutations get two extra checks in clean_mutations.py:
          - Promoter exemption: if Nucleotide_Change has a negative position (regex -\d),
            an empty Resistance is tolerated (promoter mutations may legitimately lack a
            paired drug name).
          - Position-consistency check: when both Nucleotide_Change and Protein_Change
            carry position numbers, the nucleotide position must be ~3x the protein
            position (+/-2); otherwise Nucleotide_Change is cleared (likely a copy-paste
            of the protein position).
        Mutations: 26,094 rows remain.

So "antib_bact" = restricted to rows carrying a recognized bacterial organism name (from
available_species.txt) and a recognized antibiotic name (from antibiotics_names.txt /
antibiotics_names_abreviations.txt), with both columns cleaned/standardized and rows with
no valid antibiotic dropped (organism can be blank and the row still survives, for genes).

NOTE: an earlier, abandoned prototype clean_resistance.py (root, resistance-column-only,
no organism cleaning, no drop logic) was superseded by clean_organism_resistance.py and
is not invoked by either bash script.

A8. QA / audit artifacts (Pipeline A)
------------------------------------------
  - unmatched_genes_reslit_harmonized.txt (1,121 lines) / unmatched_genes_reslit.txt
    (180 lines) — stdout captures of unmatched gene names from the two
    fix_gene_capitalization_*.py scripts.
  - empty_organism_rows.csv (5,243 lines) / empty_resistance_rows.csv (2,946 lines) —
    ad hoc dev-time dumps used to tune available_species.txt / antibiotics_names.txt and
    the _EXTRA_VALID_ORGANISMS set while developing clean_organism_resistance.py.
  - reslit_classifier.ipynb's own audit trail: removed_non_english.txt,
    removed_wrong_organism.txt, passed.txt / passed_cleaned.txt, not_passed.txt (runtime
    outputs of the notebook, not checked into this directory listing).
  - header.csv — trivial single-line header snapshot, glue for the awk concatenation
    in A4 step 4.

A9. Reference/lookup files used throughout Pipeline A
----------------------------------------------------------
  - allele_geneFamily.txt        — allele -> canonical RGC-style gene-family mapping
                                    (used by qwen3_to_csv.py / convert_annotation_databases.py)
  - Bacteria_genes_all.txt       — 99MB, ~7.34M lines; flat bacterial gene symbol/synonym
                                    list. Used both as (i) the "is this a real bacterial
                                    gene" filter in the qwen3_*_to_csv.py converters, and
                                    (ii) the capitalization source in fix_gene_capitalization_*.py.
                                    NOTE: no build script for this file is present in this
                                    checkout; presumably derived offline from Bacteria.gene_info
                                    (the raw 1.4GB NCBI Gene "gene_info" dump for taxon
                                    Bacteria) but nothing here references that dump directly.
  - Bacteria_genes.txt           — near-identical, slightly smaller sibling of the above;
                                    NOT referenced by any script (superseded).
  - available_species.txt        — valid bacterial organism names for organism-column cleaning
  - antibiotics_names.txt /
    antibiotics_names_abreviations.txt — valid antibiotic names + abbreviation expansions
                                    for resistance-column cleaning
  - chromosomalMutationGenes.txt,
    pointMutationsGenesUniq.txt,
    amrGenesUniq.txt              — used by qwen3_mutations_to_csv.py to decide whether a
                                    bare chromosomal gene with no mutation info should be
                                    kept or dropped


=====================================================================
PIPELINE B — OTHER DATABASES (CARD / ResFinder / NCBI Reference Gene Catalog)
=====================================================================

B1. Raw source acquisition
------------------------------
Documented in other_databases/databases/Readme_amr_metagenomics.txt (a pasted shell-history
style log) plus other_databases/databases/card/CARD-Download-README.txt.

  - NCBI Reference Gene Catalog (AMRFinderPlus DB):
        wget https://ftp.ncbi.nlm.nih.gov/pathogen/Antimicrobial_resistance/AMRFinderPlus/database/latest/ReferenceGeneCatalog.txt
    (confirmed by a saved FTP directory listing at
    comparison_other_databases/reference_gene_catalog/index.html, dated 2026-05-19,
    matching the file's own mtime.) Filtered to AMR/core scope+type rows via:
        awk -F"\t" '{if ($6=="AMR"||$6=="core"||$6=="D-carboxypeptidase VanY-N") print $0}' \
          | awk -F"\t" '{if ($7=="AMR"||$7=="core") print $0}' > filtered_ReferenceGeneCatalog
    Protein accessions (column 13) extracted to proteins_to_download.txt and individually
    fetched via NCBI eutils efetch, then concatenated into concatenated_amrfinderPlus.fasta.

  - CARD: manually downloaded from https://card.mcmaster.ca/download (aro_index.tsv,
    aro_categories.tsv, card.json, protein/nucleotide FASTAs, snps.txt, PMID.tsv).
    Cites Alcock et al. 2023, "CARD 2023...", Nucleic Acids Research 51, D690-D699
    (PMID 36263822). snps.txt "lists the SNPs associated with specific detection models"
    — this is the file used later to strip point-mutation entries out of the gene table
    (see B2 step F) and to build the mutations file (see B3 step 2).
    One manual curation step (no script): rows with Drug Class = "disinfecting agents and
    antiseptics" and no other resistance were manually removed from
    protein_fasta_protein_homolog_model.fasta -> protein_fasta_protein_homolog_model_noDisinfecting.fasta.

  - ResFinder: a live vendored git clone of bitbucket.org/genomicepidemiology/resfinder_db
    (VERSION 2.6.0) at other_databases/databases/resfinder/resfinder_db/. all.fsa
    translated to protein via DNA_protein_translator.py -> resfinder_protein.fasta.

  - PointFinder (point mutations) is vendored separately as a git clone of
    bitbucket.org/genomicepidemiology/pointfinder_db (VERSION 4.1.1), but only inside the
    OLDER, apparently-unused comparison_other_databases/ tree. The ACTIVE mutations
    pipeline instead reads a pre-exported resfinder_pointMutations.xlsx spreadsheet sitting
    directly in other_databases/mutations/ — there is no script in the active tree that
    regenerates that xlsx from pointfinder_db; it was exported by hand at some point
    (not reproducible from files present).

  - "all" merge directory (other_databases/databases/all/): protein sequences from all
    three sources pooled, cleaned (sed 's/gb //g', drop stop-codon-containing ResFinder
    translations), concatenated into all_proteins_amr.fasta, then clustered at 100%
    identity with:
        cd-hit -i all_proteins_amr.fasta -o nr100_all_proteins_amr.fasta -c 1.00 -aL 1.0 -n 5 -M 2000
    This clustering is later used (in the merge notebook below) to detect the SAME protein
    reported by multiple databases and merge those rows.

  - genes_annotation_databases.csv (18,076 rows) is produced by running
    concatenate_genes_annotation_databases.ipynb (other_databases/databases/all/) in
    Jupyter: reshapes filtered_ReferenceGeneCatalog.tsv, Resfinder_phenotypes.txt, and
    aro_index.tsv into one 11-column schema (ID, gene_family, genbank_protein_accession,
    genbank_nucleotide_accession, class, subclass, pubmed_reference, product_name,
    Resistance Mechanism, Database, Notes), tags Database = "Reference Gene Catalog" /
    "ResFinder Database" / "Card Database", concatenates all three, then merges rows
    across databases wherever the cd-hit clustering says they're the identical protein
    — concatenating Database and subclass with commas (e.g. a gene present in both CARD
    and ResFinder becomes one row with Database = "Card Database,ResFinder Database").
    NOTE: despite the .csv extension this file is TAB-delimited.
    Verified Database-value distribution (18,076 rows): 6,396 CARD-only, 3,340
    RefGeneCatalog+CARD, 3,203 ResFinder-only, 2,529 RefGeneCatalog-only, 2,193 all-three,
    plus smaller combinations.

B2. Genes chain (-> final "..._bla_fixed.csv")
---------------------------------------------------
  Step B: python3 convert_annotation_databases.py <in.csv> <out.csv>   (paper root script)
      genes_annotation_databases.csv -> genes_databases_allOther.csv
      Column mapping: gene_family -> gene_name (+ copied into allele), subclass ->
      confers_resistance_to (comma->pipe), class -> resistance_mechanism_class,
      product_name -> encodes, Resistance Mechanism -> mechanism, pubmed_reference ->
      paper_pmid (first PMID only if multiple), genbank_protein_accession +
      genbank_nucleotide_accession -> sequence_accessions (pipe-joined), Database ->
      source_database, Notes -> notes. Gene-name normalization via normalize_gene_name()
      imported from qwen3_to_csv.py, using allele_geneFamily.txt. 18,076 rows (unchanged).

  Step C: python3 enrich_database_metadata.py other_databases/genes_databases_allOther.csv \
              other_databases/genes_databases_enriched.csv --email skulakis@gmail.com
      Same shared PubMed-enrichment script as Pipeline A5 step 3. 18,076 rows (unchanged).

  Step D: python3 build_other_databases_genes.py   (other_databases/amr_genes/)
      genes_databases_enriched.csv -> Full_list_genes_otherDatabases.csv
      ROW FAN-OUT: source_database (comma-separated) split into one output row per unique
      database -> row count jumps 18,076 -> 26,208 (confirmed in build_log.txt). Accessions
      in sequence_accessions classified nucleotide / protein / invalid by regex; invalid
      ones dropped. Organism resolved via NCBI: batched esummary -> TaxId -> batched
      efetch(taxonomy) -> scientific name, cached in .ncbi_genes_organism_cache.json.
      Output columns renamed to the final schema (same as A4 step 8's schema).

  Step D': fill_missing_organisms.py   (overwrites Full_list_genes_otherDatabases.csv in place)
      Second-pass organism fill for the 946 rows still empty after Step D: retries via
      protein-accession esummary, falls back to efetch(db="protein", rettype="gp") for
      accessions ESummary rejects as "Invalid uid" (common for newer WGS/Pathogen-Detection
      accessions). fill_log.txt: 781/946 filled, 165 unresolved. Row count unchanged (26,208).

  Step E: *** NO SCRIPT — DONE INTERACTIVELY ***
      Full_list_genes_otherDatabases.csv -> Full_list_genes_otherDatabases_AlleleCorrected-1.csv
      "AlleleCorrected" = corrected rows where the Allele field had been wrongly duplicated
      from Gene (should instead reflect an actual allele designation, distinct from what
      belongs in Encodes). Done as an ad hoc interactive edit — a fragment of the original
      request is preserved verbatim in amr_genes/readme.txt. No AlleleCorrected.csv (without
      the "-1" suffix) exists, only the "-1" version, suggesting at least one redo.
      Row count drops 26,208 -> 26,053 (155 rows lost, reason undocumented).

  Step F: python3 remove_snp_matches.py
      ..._AlleleCorrected-1.csv -> ..._filtered.csv
      "filtered" = drops any gene row whose Gene or Allele (lowercased) matches a CARD
      Short Name from snps.txt (CARD's point-mutation model names) — i.e. removes rows
      that are actually point-mutation model entries that leaked into the gene-
      presence/absence table (those belong in the mutations pipeline instead).
      26,053 -> 25,865 rows (188 removed).

  Step G: python3 concatenate_duplicate_rows.py
      ..._filtered.csv -> ..._filtered_concatenated.csv
      "concatenated" = groups rows by (Database, Gene, Allele, Protein_accession); for
      groups with >1 row, all non-key columns are merged by taking the union of unique
      non-empty values and joining them with ", ". 25,865 -> 22,082 rows (3,783 groups
      merged/collapsed).

  Step H: python3 fix_bla_alleles.py
      ..._filtered_concatenated.csv -> ..._filtered_concatenated_bla_fixed.csv   *** SEED FILE ***
      "bla_fixed" = for any row where Gene starts with "bla" (case-insensitive —
      beta-lactamase genes, e.g. blaTEM-1, blaCTX-M-15), if Allele does NOT already start
      with "bla", prepends the literal string "bla" to it (e.g. Gene=blaCTX-M-15,
      Allele=CTX-M-15 -> Allele=blaCTX-M-15). Row count unchanged, 22,082.

  (A further step, clean_other_genes.py -> Full_list_genes_otherDatabases_clean.csv, exists
  but is NOT one of the seed files. Its behavior as documented in amr_genes/readme.txt
  — dropping rows with no recognized antibiotic, down to 18,391 rows — does NOT match what
  the script on disk actually does: as verified, it performs zero row-dropping and the
  output file has 22,082 rows, identical to its input. Treat that readme's row-count
  claims as stale/describing an earlier version of the script.)

B3. Mutations chain (-> final "..._clean.csv")
----------------------------------------------------
Governed by other_databases/mutations/README_mutations.txt. concatenate_details.py is an
explicit Python rewrite of an earlier concatenate_details.R (dated 2024-11-13, run
interactively — .RData/.Rhistory survive); the .R version is superseded.

  Step 1: python3 expand_res_codon.py
      resfinder_pointMutations.xlsx -> resfinder_pointMutations_expanded.xlsx
      Expands ResFinder rows with a comma-separated multi-value Res_codon (e.g. "T,I")
      into one row per value, so each row represents exactly one point mutation.

  Step 2: python3 concatenate_details.py
      Three raw sources -> full_list_mutations.csv (10,595 rows)
        - ResFinder (resfinder_pointMutations_expanded.xlsx): gene parsed from
          #Gene_accession's first "_"-token.
        - AMRFinder/NCBI (ReferenceGeneCatalog_PointMutations.csv): gene/mutation split
          from the allele column; TypeGene = NUC if product_name contains "ribosomal RNA"
          or codon position is negative (promoter), else AA.
        - CARD (snps.txt): mutations exploded from comma/"+"-joined Mutations cells;
          TypeGene = NUC only when Model Type == "rRNA gene variant model"; gene/drug
          parsed from CARD Short Name, drug abbreviation resolved via a
          shortname_antibiotics.tsv lookup.
          KNOWN ISSUE: SHORTNAME_ANTIBIOTICS_FILE is hardcoded to a path in an EARLIER,
          separate project directory (/home/argis/Desktop/austin/amr_metagenomics_pavlopoulos/
          databases/card/shortname_antibiotics.tsv), not the copy shipped inside this
          pipeline (other_databases/databases/card/shortname_antibiotics.tsv). Still
          resolves today because that old directory exists on disk, but it's a fragile
          leftover reference from before the project was reorganized into reslit/site/paper/.
        - Gene_normalized built via _slug() = re.sub(r"[^a-z0-9]", "", name.lower()) — the
          cross-database matching key for this sub-pipeline.
        - Multi-PMID cells exploded to one PMID per row.

  Step 3: python3 ../../enrich_database_metadata.py full_list_mutations.csv \
              full_list_mutations_enriched.csv --email skulakis@gmail.com
      Same shared PubMed-enrichment script as elsewhere.

  Step 4: python3 remove_promoter_aa_mismatches.py   (overwrites in place)
      Drops rows where TypeGene == "AA" but Gene contains "promoter" (nucleotide-level
      promoter mutations mislabeled as amino-acid changes). 10,595 -> 8,973 rows; all
      1,620 removed rows are Database=ResFinder, logged to removed_mutations.csv
      (e.g. embA-promoter-size-115bp, PMID 19209951).

  Step 5: python3 add_dna_accession.py
      -> full_list_mutations_enriched_with_dna_accession.csv
      Resolves a DNA_Accession per row: CARD ("CARD:{id}" looked up as "ARO:{id}" in
      ../databases/card/aro_index.tsv's DNA Accession column), AMRFinder (Gene_accession
      used as-is), ResFinder (regex-extracts the trailing NCBI accession from
      Gene_accession, e.g. gyrA_1_LR134511.1 -> LR134511.1). Row count unchanged.

  Step 6: python3 add_organism_accession.py
      -> full_list_mutations_enriched_with_organism.csv
      Batched NCBI lookup (nucleotide esummary -> TaxId -> taxonomy efetch ->
      ScientificName), cached in .ncbi_organism_cache.json. Row count unchanged (8,973).

  Step 7: python3 build_final_mutations.py
      -> Full_list_mutations_otherDatabases.csv
      Splits Change into Nucleotide_Change (TypeGene==NUC) or Protein_Change (AA);
      Gene = Gene_normalized; Organism = first two words of organism_accession (genus +
      species); CARD rows get "CARD accession: CARD:XXXXX" appended to Notes; Encodes,
      Validated_by, Origin left empty. ~8,972-8,973 rows.

  Step 8: python3 fix_gene_capitalization.py   (overwrites in place)
      Restores proper gene-name capitalization lost by the _slug() lowercasing in Step 2,
      matching against Bacteria_genes_all.txt. 195/249 unique genes corrected (e.g.
      gyra->gyrA, rpob->rpoB, rv0678->Rv0678); 32 had no match (e.g. blaoxa143, dhfr,
      dhps, k13, porin) and were left unchanged.

  Step 9: python3 clean_other_mutations.py
      Full_list_mutations_otherDatabases.csv -> Full_list_mutations_otherDatabases_clean.csv   *** SEED FILE ***
      Reuses the same clean_organism_resistance.py helpers as Pipeline A, adapted for this
      file's separators:
        - Organism checked against available_species.txt; non-biological entries removed.
        - Resistance: split by ","/"&" first (handles combo drugs like
          AZTREONAM-AVIBACTAM), then remaining "/"-joined multi-drug parts (e.g.
          AMIKACIN/GENTAMICIN/KANAMYCIN/TOBRAMYCIN -> 4 entries) resolved individually;
          abbreviations expanded; normalized lowercase; deduplicated; rejoined with "|".
        - Nucleotide/Protein position cross-validation (validate_nuc_vs_prot()): same
          ~3x-codon-math check as Pipeline A7.
        - Row removal: drops rows with no recognized antibiotic in Resistance, EXCEPT
          promoter mutations (negative position in Nucleotide_Change, _PROMOTER_RE).
      Verified: 8,972 -> 8,866 rows (106 dropped).
      NOTE: README_mutations.txt's own "Step 9" claims 180 dropped / 8,792 remaining —
      doesn't match the actual output. The README's mtime (2026-06-26 22:03) is ~23
      minutes before the final file's mtime (2026-06-26 22:26), and the README's own last
      line reads "Change these manually" — i.e. some post-hoc manual edits exist that
      aren't fully documented. Treat the README's exact figures as a stale snapshot.

B4. Shared harmonization logic
-----------------------------------
other_databases/comparison/genes/harmonize_names.py (same script as Pipeline A6) is
ONE-DIRECTIONAL: it treats the other-databases file as canonical and rewrites the
*Reslit* file's casing to match — which is why it lives in the "comparison" directory and
is invoked from the Reslit build script (bash_commands_for_genes.sh), not from anything in
amr_genes/ or mutations/. The other-databases build scripts instead independently reuse
clean_organism_resistance.py's organism/antibiotic helpers, and each re-implement the same
simple lowercase+strip-prime-marks normalizer inline (in fix_gene_capitalization.py for
mutations, fix_gene_capitalization_genes.py/_reslit.py for genes on the Reslit side).

A second, more elaborate normalizer — normalize_gene_name() + load_allele_gene_family() in
qwen3_to_csv.py, keyed off allele_geneFamily.txt — is used earlier, by
convert_annotation_databases.py (B2 Step B), to canonicalize gene_family values from the
raw annotation-databases merge. Do not confuse the two: this one is the *first*
harmonization touchpoint in the genes chain; harmonize_names.py is the *last*.

B5. QA / audit artifacts (Pipeline B)
------------------------------------------
  - other_databases/amr_genes/build_log.txt (51,511 bytes) — stdout of
    build_other_databases_genes.py: 18,076 source rows, 13,605 unique nucleotide + 10,858
    unique protein accessions, per-batch "Invalid UID" logs, final 26,208-row output.
  - other_databases/amr_genes/fill_log.txt (17,580 bytes) — stdout of
    fill_missing_organisms.py: 946 empty-organism rows at start, 516 unique protein
    accessions queried, 781 filled, 165 unresolved.
  - .ncbi_genes_organism_cache.json (amr_genes/) and .ncbi_organism_cache.json
    (mutations/) — persistent accession->TaxId->scientific-name caches, kept SEPARATE
    between the genes side and mutations side.
  - other_databases/mutations/removed_mutations.csv (1,620 rows) — audit trail from
    remove_promoter_aa_mismatches.py; every row is Database=ResFinder, mislabeled
    TypeGene=AA promoter-region entries.
  - other_databases/comparison/genes/gene_database_membership.csv (4,151 rows) —
    cross-database presence/absence matrix (columns: gene, in_ResLit, in_ResFinder,
    in_CARD, in_RefGeneCatalog, num_databases) — QA table for the venn/overlap comparisons
    in comparison_full_lists.ipynb, not part of the build chain itself.
  - comparison_other_databases/ (an entire separate, OLDER/exploratory directory tree with
    its own card_harmonized.tsv, resfinder_harmonized.tsv, and a vendored pointfinder_db
    clone at v4.1.1) — nothing in the active other_databases/{amr_genes,mutations,
    comparison}/ build scripts references this directory. Inferred to be an earlier,
    hand-organized snapshot / parallel-exploration pass, superseded by the scripted
    other_databases/ tree used above.


=====================================================================
HOW THE FOUR FILES COME TOGETHER
=====================================================================

scripts/seed-sqlite.mjs (webapp repo), run via `pnpm db:seed`:

  1. Clears papers / amr_genes / amr_mutations tables (curator accounts, comments, and
     curation history are NOT touched — not sourced from CSV).
  2. Derives `papers` rows by deduplicating PMIDs across all four CSVs (paper metadata is
     denormalized onto every gene/mutation row in the source CSVs, not exported
     separately, so papers rows have to be reconstructed here to satisfy the
     amr_genes.paper_pmid foreign key and to populate getPaperDetail()).
  3. Loads both genes files together into amr_genes (Reslit rows keep Database="Reslit";
     other-databases rows keep their per-database label from the merge in B1/B2).
  4. Loads both mutations files into amr_mutations, NORMALIZING the other-databases file's
     source labels (AMRFinder / CARD / ResFinder) to the genes file's three canonical
     names (Reference Gene Catalog / Card Database / ResFinder Database) via
     MUTATION_DB_NAME_MAP, so the validation-tier logic in lib/actions/browse.ts's
     EXTERNAL_DATABASES can compare them consistently. This cross-referencing against
     independently-reported entries outside Pipeline A is exactly what lets a gene/
     mutation be marked "Confirmed"/"Established" instead of capped at
     "Supported"/"Candidate".

Re-running scripts/seed-sqlite.mjs is safe: editing any of the four source CSVs and
re-running always gives a clean replace, not duplicate rows.


=====================================================================
CAVEATS / KNOWN GAPS (worth keeping in mind for a methods section)
=====================================================================

1. The actual LLM extraction driver code (Qwen3-30B-A3B prompts/chunking, how
   audit_enabled/reviews works) is NOT present in this checkout — only its JSON output
   (extraction_summary_batch1-6.json) and the downstream converters survive.

2. Two steps have no reusable script and were done via interactive editing:
     - Pipeline B, genes, "AlleleCorrected-1" (B2 Step E) — a fragment of the original
       request survives verbatim in other_databases/amr_genes/readme.txt.
     - Part of Pipeline A's mutation cleanup (A5 step 5) is documented only in prose
       inside bash_commands_for_mutations.sh; the exact code wasn't preserved as a
       runnable script.
   Neither is push-button reproducible from scripts alone.

3. Two readmes' documented row-drop counts do NOT match the files actually on disk
   (verified directly, not just taken on faith):
     - amr_genes/readme.txt claims clean_other_genes.py drops ~3,691 rows (22,082 ->
       18,391); the script and its actual output show ZERO rows dropped (22,082 in =
       22,082 out). clean_other_genes.py is a post-seed-file step, so this doesn't affect
       the seed CSVs, but it does mean that file's readme text describes either an earlier
       script version or an unimplemented intention.
     - README_mutations.txt claims clean_other_mutations.py drops 180 rows (8,972 ->
       8,792); the actual seed file has 8,866 rows (106 dropped). The README's own last
       line ("Change these manually") suggests undocumented manual post-processing
       happened after the README was last edited.

4. A stale hardcoded path in concatenate_details.py (SHORTNAME_ANTIBIOTICS_FILE) points to
   a sibling LEGACY project directory (amr_metagenomics_pavlopoulos) outside the reslit
   tree entirely, for one lookup table. Still resolves today but is fragile — would break
   if that old directory is ever removed.

5. Two reference gene-name lists exist (Bacteria_genes.txt and Bacteria_genes_all.txt);
   only _all is actually used by any script. Neither has a surviving derivation script
   from the raw Bacteria.gene_info NCBI dump (1.4GB) also present in this directory.

6. resfinder_pointMutations.xlsx's ultimate source is not reproducible from files present
   — no script converts the vendored pointfinder_db git clone (only present in the
   separate, apparently-unused comparison_other_databases/ tree, at PointFinder v4.1.1)
   into that xlsx. It was exported by hand at some point.

7. Pipeline A, genes step E (A4 step 5) — a comment in the script/bash history mentions
   the step is also meant to "remove lines that have rrs, cya6mannnnnngrty" (garbage-like
   gene names), but the actual awk command executed only filters on empty paper_title;
   that part of the comment appears aspirational rather than implemented.


=====================================================================
QUICK REFERENCE — FULL REPRODUCTION COMMANDS
=====================================================================

--- Pipeline A, genes (run from this directory) ---
python qwen3_to_csv.py extraction_summary_batch1.json genes_batch1.csv
python qwen3_to_csv.py extraction_summary_batch2.json genes_batch2.csv
python qwen3_to_csv.py extraction_summary_batch3.json genes_batch3.csv
python qwen3_to_csv.py extraction_summary_batch4.json genes_batch4.csv
python qwen3_to_csv.py extraction_summary_batch5.json genes_batch5.csv
python qwen3_to_csv.py extraction_summary_batch6.json genes_batch6.csv
awk 'FNR==1 && NR!=1 {next} {print}' genes_batch{1..6}.csv > genes_all.csv
cat genes_all.csv | grep "experimentally_characterized" > genes_all_experimentally_characterized.csv
head -n 1 genes_all.csv > header.csv
cat header.csv genes_all_experimentally_characterized.csv > genes_all_experimental_characterized.csv
# inline pandas heredoc adding gene_name_normalised -> normalised_genes_all_experimental_characterized.csv
awk -v FPAT='([^,]*)|("([^"]|"")*")' 'NR == 1 || ($2 != "" && $2 != "\"\"")' \
    normalised_genes_all_experimental_characterized.csv > normalised_genes_all_experimental_characterized_full.csv
awk '{sub(/\r$/, ""); if (NR==1) print $0 ",Database"; else print $0 ",Reslit"}' \
    normalised_genes_all_experimental_characterized_full.csv > normalised_genes_all_experimental_characterized_full_final.csv
python build_reslit_genes.py
python /home/argis/Desktop/austin/reslit/site/paper/other_databases/comparison/genes/harmonize_names.py
python3 fix_gene_capitalization_genes.py
python3 clean_organism_resistance.py
# --> Full_list_genes_Reslit_harmonized_antib_bact.csv

--- Pipeline A, mutations (run from this directory) ---
python qwen3_mutations_to_csv.py extraction_summary_batch1.json mutations_batch1.csv
python qwen3_mutations_to_csv.py extraction_summary_batch2.json mutations_batch2.csv
python qwen3_mutations_to_csv.py extraction_summary_batch3.json mutations_batch3.csv
python qwen3_mutations_to_csv.py extraction_summary_batch4.json mutations_batch4.csv
python qwen3_mutations_to_csv.py extraction_summary_batch5.json mutations_batch5.csv
python qwen3_mutations_to_csv.py extraction_summary_batch6.json mutations_batch6.csv
head -1 mutations_batch1.csv > mutations_all.csv && tail -n +2 -q mutations_batch*.csv >> mutations_all.csv
python3 enrich_database_metadata.py mutations_all.csv mutations_all_enriched.csv --email skulakis@gmail.com
# filter to rows with non-empty normalised_gene_mutation/normalised_protein_change -> mutations_all_final.csv
# additional cleanup (rrs/rrl fixes, organism required) -> mutations_all_final_organisms.csv
python build_reslit_mutations.py
python3 fix_gene_capitalization_reslit.py
python clean_mutations.py
# --> Full_list_mutations_Reslit_antib_bact.csv

--- Pipeline B, genes ---
# 1. Download raw sources (largely manual — see B1)
# 2. Run concatenate_genes_annotation_databases.ipynb in Jupyter (other_databases/databases/all/)
#    -> genes_annotation_databases.csv
cd /home/argis/Desktop/austin/reslit/site/paper
python3 convert_annotation_databases.py \
    other_databases/databases/genes_annotation_databases.csv \
    other_databases/genes_databases_allOther.csv
python3 enrich_database_metadata.py \
    other_databases/genes_databases_allOther.csv \
    other_databases/genes_databases_enriched.csv \
    --email skulakis@gmail.com
cd other_databases/amr_genes
python3 build_other_databases_genes.py
python3 fill_missing_organisms.py
# AlleleCorrected-1 step: NO SCRIPT -- done interactively, not reproducible as a command
python3 remove_snp_matches.py
python3 concatenate_duplicate_rows.py
python3 fix_bla_alleles.py
# --> Full_list_genes_otherDatabases_AlleleCorrected-1_filtered_concatenated_bla_fixed.csv

--- Pipeline B, mutations ---
cd /home/argis/Desktop/austin/reslit/site/paper/other_databases/mutations
python3 expand_res_codon.py
python3 concatenate_details.py
python3 ../../enrich_database_metadata.py \
    full_list_mutations.csv full_list_mutations_enriched.csv \
    --email skulakis@gmail.com
python3 remove_promoter_aa_mismatches.py
python3 add_dna_accession.py
python3 add_organism_accession.py
python3 build_final_mutations.py
python3 fix_gene_capitalization.py
python3 clean_other_mutations.py
# --> Full_list_mutations_otherDatabases_clean.csv

--- Load everything into the app database ---
cd ../../../site/site/site   # webapp repo root
pnpm db:seed
