#!/usr/bin/env node
/**
 * get-latest-smolai-url.mjs
 *
 * Fetches Smol AI homepage, extracts issue URLs, and returns the next
 * unprocessed issue URL. Tracks processed issues in state/memory/processed_issues.yaml
 *
 * Usage:
 *   ./get-latest-smolai-url.mjs          # Print next unprocessed URL
 *   ./get-latest-smolai-url.mjs --mark   # Mark latest as processed (after successful curation)
 *   ./get-latest-smolai-url.mjs --list   # List all available issues
 *   ./get-latest-smolai-url.mjs --status # Show processed vs pending count
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const SMOL_AI_BASE = 'https://news.smol.ai';
const PROCESSED_FILE = 'state/memory/processed_issues.yaml';

/**
 * Load processed issues from YAML file
 */
function loadProcessedIssues() {
  if (!fs.existsSync(PROCESSED_FILE)) {
    return { processed: [], last_check: null };
  }
  try {
    const content = fs.readFileSync(PROCESSED_FILE, 'utf-8');
    return yaml.load(content) || { processed: [], last_check: null };
  } catch (e) {
    console.error('Error loading processed issues:', e.message);
    return { processed: [], last_check: null };
  }
}

/**
 * Save processed issues to YAML file
 */
function saveProcessedIssues(data) {
  const dir = path.dirname(PROCESSED_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  data.last_check = new Date().toISOString();
  fs.writeFileSync(PROCESSED_FILE, yaml.dump(data));
}

/**
 * Fetch and parse issue URLs from Smol AI homepage
 */
async function fetchIssueUrls() {
  const response = await fetch(SMOL_AI_BASE, {
    headers: {
      'User-Agent': 'SynthBot/1.0 (Fetching AI news for curation)'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Extract issue URLs from the HTML
  // Pattern: /issues/YY-MM-DD-slug
  const issueRegex = /\/issues\/(\d{2}-\d{2}-\d{2}-[a-z0-9-]+)/g;
  const issues = new Set();
  let match;

  while ((match = issueRegex.exec(html)) !== null) {
    issues.add(match[1]);
  }

  // Sort by date (most recent first)
  // Date format: YY-MM-DD, so lexicographic sort works
  return Array.from(issues).sort().reverse();
}

/**
 * Parse issue slug to extract date
 */
function parseIssueDate(slug) {
  const match = slug.match(/^(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, yy, mm, dd] = match;
  return new Date(`20${yy}-${mm}-${dd}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'next';

  try {
    const data = loadProcessedIssues();
    const issues = await fetchIssueUrls();

    if (issues.length === 0) {
      console.error('No issues found on Smol AI homepage');
      process.exit(1);
    }

    // Find unprocessed issues
    const unprocessed = issues.filter(slug => !data.processed.includes(slug));

    switch (mode) {
      case '--list':
        console.log('All issues (most recent first):');
        for (const slug of issues) {
          const status = data.processed.includes(slug) ? '✓' : ' ';
          console.log(`  [${status}] ${SMOL_AI_BASE}/issues/${slug}`);
        }
        break;

      case '--status':
        console.log(`Total issues: ${issues.length}`);
        console.log(`Processed: ${data.processed.length}`);
        console.log(`Pending: ${unprocessed.length}`);
        if (unprocessed.length > 0) {
          console.log(`\nNext: ${SMOL_AI_BASE}/issues/${unprocessed[0]}`);
        }
        break;

      case '--mark':
        // Mark the most recent issue as processed
        if (issues.length > 0) {
          const latest = issues[0];
          if (!data.processed.includes(latest)) {
            data.processed.push(latest);
            saveProcessedIssues(data);
            console.log(`Marked as processed: ${latest}`);
          } else {
            console.log(`Already processed: ${latest}`);
          }
        }
        break;

      case '--mark-url':
        // Mark a specific URL as processed
        if (args[1]) {
          // Extract slug from URL
          const urlMatch = args[1].match(/\/issues\/([a-z0-9-]+)/i);
          if (urlMatch) {
            const slug = urlMatch[1];
            if (!data.processed.includes(slug)) {
              data.processed.push(slug);
              saveProcessedIssues(data);
              console.log(`Marked as processed: ${slug}`);
            } else {
              console.log(`Already processed: ${slug}`);
            }
          } else {
            console.error('Invalid URL format. Expected /issues/YY-MM-DD-slug');
            process.exit(1);
          }
        } else {
          console.error('Usage: --mark-url <url>');
          process.exit(1);
        }
        break;

      default:
        // Return next unprocessed URL
        if (unprocessed.length === 0) {
          console.log('All issues processed. Nothing new.');
          process.exit(0);
        }
        // Return the most recent unprocessed issue
        console.log(`${SMOL_AI_BASE}/issues/${unprocessed[0]}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
