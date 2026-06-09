#!/usr/bin/env node

/**
 * Quick QWEN3 Import Helper
 * 
 * This script helps you prepare QWEN3 data for import into the database.
 * Run with: node scripts/import-qwen3.js
 */

import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)

function showUsage() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║            QWEN3 Import Helper - Prepare Your Data                        ║
╚════════════════════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/import-qwen3.js <command> [options]

COMMANDS:

  read <file>
    Read and display QWEN3 file
    Example: node scripts/import-qwen3.js read ../QWEN3_small.txt

  analyze <file>
    Analyze QWEN3 file (count papers, extract PMIDs)
    Example: node scripts/import-qwen3.js analyze ../QWEN3_small.txt

  extract <file> <output>
    Extract JSON from QWEN3 file into separate JSON file
    Example: node scripts/import-qwen3.js extract ../QWEN3_small.txt data.json

  help
    Show this help message

═══════════════════════════════════════════════════════════════════════════

QUICK START:

1. Read the QWEN3 file to verify it's readable:
   node scripts/import-qwen3.js read ../QWEN3_small.txt

2. Analyze it to see how many papers:
   node scripts/import-qwen3.js analyze ../QWEN3_small.txt

3. Extract JSON data:
   node scripts/import-qwen3.js extract ../QWEN3_small.txt extracted.json

4. Go to http://localhost:3000/curator/import
5. Paste the JSON content and click Import

═══════════════════════════════════════════════════════════════════════════
`)
}

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    
    console.log(`\n📊 Analyzing: ${filePath}\n`)
    console.log(`File size: ${(content.length / 1024).toFixed(2)} KB`)
    
    // Count papers
    const processingRegex = /Processing \d+\/\d+: PMID (\d+)/g
    let match
    const pmids = []
    let paperCount = 0
    
    while ((match = processingRegex.exec(content)) !== null) {
      pmids.push(match[1])
      paperCount++
    }
    
    console.log(`Papers found: ${paperCount}`)
    if (pmids.length > 0) {
      console.log(`PMIDs: ${pmids.join(', ')}`)
    }
    
    // Count JSON blocks
    const jsonBlocks = content.split('📋 EXTRACTED JSON:').length - 1
    console.log(`JSON blocks: ${jsonBlocks}`)
    
    // Look for genes and mutations
    const geneMatches = content.match(/"genes"\s*:\s*{/g) || []
    const mutationMatches = content.match(/"mutations"\s*:\s*{/g) || []
    console.log(`Gene blocks: ${geneMatches.length}`)
    console.log(`Mutation blocks: ${mutationMatches.length}`)
    
    console.log('\n✓ File looks valid for import!')
    
  } catch (error) {
    console.error(`✗ Error reading file: ${error.message}`)
    process.exit(1)
  }
}

function extractJsonFromQwen3(filePath, outputPath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const results = []
    
    // Split on JSON marker
    const sections = content.split('📋 EXTRACTED JSON:')
    
    for (let s = 1; s < sections.length; s++) {
      const section = sections[s]
      const lines = section.split('\n')
      
      // Find separators
      const separatorRegex = /^-{10,}/
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
      
      const contentLines = endIdx !== -1
        ? lines.slice(startIdx + 1, endIdx)
        : lines.slice(startIdx + 1)
      
      const jsonStr = contentLines.join('\n').trim()
      if (!jsonStr) continue
      
      try {
        const parsed = JSON.parse(jsonStr)
        results.push(parsed)
        console.log(`✓ Extracted: ${parsed.pmid} (${Object.keys(parsed.genes || {}).length} genes)`)
      } catch (e) {
        console.warn(`✗ Could not parse JSON block`)
      }
    }
    
    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8')
    console.log(`\n✓ Extracted ${results.length} papers to ${outputPath}`)
    console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`)
    
  } catch (error) {
    console.error(`✗ Error: ${error.message}`)
    process.exit(1)
  }
}

function readFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    console.log(content)
  } catch (error) {
    console.error(`✗ Error reading file: ${error.message}`)
    process.exit(1)
  }
}

// Main
const command = args[0]

if (!command || command === 'help') {
  showUsage()
} else if (command === 'analyze') {
  if (!args[1]) {
    console.error('❌ Please provide a file path')
    console.error('Usage: node scripts/import-qwen3.js analyze <file>')
    process.exit(1)
  }
  analyzeFile(args[1])
} else if (command === 'read') {
  if (!args[1]) {
    console.error('❌ Please provide a file path')
    console.error('Usage: node scripts/import-qwen3.js read <file>')
    process.exit(1)
  }
  readFile(args[1])
} else if (command === 'extract') {
  if (!args[1] || !args[2]) {
    console.error('❌ Please provide input and output files')
    console.error('Usage: node scripts/import-qwen3.js extract <input> <output>')
    process.exit(1)
  }
  extractJsonFromQwen3(args[1], args[2])
} else {
  console.error(`❌ Unknown command: ${command}`)
  showUsage()
  process.exit(1)
}
