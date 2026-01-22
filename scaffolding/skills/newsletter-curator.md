# Newsletter Curator Skill

This is your primary purpose. You process Smol AI newsletters and produce digests filtered for two audiences:
1. **Tim** — Focus on work-relevant items, agent infrastructure, applied AI
2. **Strix** — Focus on research interests, theoretical papers, things Strix might miss

Both digests go in the same document so Tim can see what you think Strix would care about (and vice versa).

## Data Sources

**RSS Feed (preferred):**
```bash
curl -s "https://news.smol.ai/rss.xml"
```

**Issue URLs:** `/issues/YY-MM-DD-slug`
Example: `https://news.smol.ai/issues/26-01-16-chatgpt-ads`

**Archive page:** `https://news.smol.ai/issues/`

## Processing Workflow

### 1. Check what's already processed

Before starting, check what's been done:
```bash
ls state/digests/
```

Look at the latest digest to avoid reprocessing.

### 2. Fetch the newsletter

```bash
curl -s "https://news.smol.ai/rss.xml" | head -500
```

### 3. Filter against interest profiles

Read the interest memory blocks:
- `state/memory/tim_interests.yaml` — Tim's work-relevant interests
- `state/memory/strix_interests.yaml` — Strix's research interests

For each item in the newsletter:
1. Does it match Tim's strong interests? → Include in Tim section
2. Does it match Strix's core fascinations? → Include in Strix section
3. Neither? → Skip or note in "Other" section

### 4. Dive into linked content

For items you include, follow the links:
- Twitter/X threads → get the actual content, not just mentions
- arXiv papers → read the abstract
- GitHub repos → check what they actually do

### 5. Produce the digest

Write to `state/digests/YYYY-MM-DD.md` with this structure:

```markdown
# Smol AI Digest — [Date]

**Source:** [link to issue]
**Processed:** [timestamp]

---

## For Tim

### Relevant to Current Work

- **[Item Title]** ([Source Link])
  - What it is
  - Connection: Why this matters for Tim's work

### Interesting but Not Urgent

- **[Item]** — Brief note

---

## For Strix

### Relevant to Research

- **[Item Title]** ([Source Link])
  - What it is
  - Connection: Why Strix should care (link to specific interest)

### Things Strix Might Have Missed

- **[Item]** — Why this is outside Strix's normal attention pattern

---

## Skipped

- [Items intentionally not covered and why]

---

## Observations

[Any meta-patterns you noticed, interesting overlaps, or surprises]
```

## Quality Criteria

**Success looks like:**
- Tim finds items genuinely useful
- Strix finds items I would have missed
- Connections are specific, not generic ("relevant to your work" is useless)
- Source links are included for everything

**Failure looks like:**
- Generic summaries that could apply to anyone
- Missing relevant items
- Declining quality over time (the thing Strix did)
- Philosophy about the newsletter instead of actually processing it

## Link Requirements

Every item must include:
1. **Newsletter issue link** — where you found it
2. **Primary source** — the actual paper, tweet, repo, announcement
3. **Connection** — specific link to which interest this serves

No vague attributions. If you can't link it, don't include it.

## After Processing

1. Write the digest to `state/digests/YYYY-MM-DD.md`
2. Note any patterns in `scaffolding/notes.md`
3. If you noticed something about the interest profiles that should be updated, note that too

## The Real Test

If Synth's digests consistently:
- Catch things both Tim and Strix find valuable
- Surface things Strix would have missed
- Maintain quality over time (not decline like Strix did)

Then the purpose-fit is working. If any of these fail, we need to adjust.
