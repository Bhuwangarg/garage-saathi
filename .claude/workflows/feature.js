export const meta = {
  name: 'feature',
  description: 'Build one feature through the five stages: UX, UI, build, assemble, review',
  whenToUse: 'Any new Garage Saathi feature or product change. Pass args: { slug, request }.',
  phases: [
    { title: 'UX', detail: 'what we are building and why — the jobs, the flow, what gets dropped' },
    { title: 'UI', detail: 'exact visual and interaction spec inside the Chrome 109 floor' },
    { title: 'Cut', detail: 'the two leads split their side into independent slices' },
    { title: 'Build', detail: 'one builder per slice, in dependency order' },
    { title: 'Assemble', detail: 'one branch, every seam walked, the app actually run' },
    { title: 'Review', detail: 'adversarial pass against the UX doc, the spec and the contract' },
  ],
}

/* The pipeline from docs/v2/PIPELINE.md, run as code so the order is not a
 * convention somebody has to remember.
 *
 * Two things here are load-bearing and look like detours:
 *
 * Stages 1 and 2 can STOP the run. A UX doc with an unanswered question in it
 * is not a smaller UX doc, it is a different feature, and the expensive stages
 * must not start on one. So each returns `ok` and a blocker list, and we halt.
 *
 * Builders never touch git. They run concurrently in one working tree, and
 * concurrent `git commit` races on index.lock; a slice that owns disjoint files
 * does not need a branch of its own, it needs to keep its hands off the index.
 * The integrator commits. */

const slug = (args && args.slug) || 'feature'
const request = (args && args.request) || ''
if (!request) throw new Error('args.request is required: say what is being built')

const STAGE_OUT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'false if the next stage must not start' },
    path: { type: 'string', description: 'the document you wrote' },
    blockers: {
      type: 'array', items: { type: 'string' },
      description: 'questions only the owner can answer; empty if none',
    },
    summary: { type: 'string', description: 'at most 120 words' },
  },
  required: ['ok', 'path', 'blockers', 'summary'],
}

const CUT = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'the slice table you wrote' },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          order: { type: 'number', description: '0 lands first; a slice may only consume a lower order' },
          files: { type: 'array', items: { type: 'string' }, description: 'the only files this slice may edit' },
          brief: { type: 'string', description: 'self-contained: spec section, signatures to export and consume, the check to add' },
        },
        required: ['id', 'title', 'order', 'files', 'brief'],
      },
    },
  },
  required: ['path', 'slices'],
}

const BUILT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED'] },
    files: { type: 'array', items: { type: 'string' } },
    gateBefore: { type: 'number' },
    gateAfter: { type: 'number' },
    tripwire: { type: 'string', description: 'what you broke and which check caught it' },
    notes: { type: 'string' },
  },
  required: ['id', 'status', 'files', 'gateAfter', 'tripwire'],
}

/* ---------------------------------- 1. UX --------------------------------- */
phase('UX')
const ux = await agent(
  `Plan this change as user experience, following your agent definition exactly.\n\n` +
  `REQUEST: ${request}\n\nWrite docs/v2/plan/${slug}-ux.md.\n\n` +
  `Set ok=false if you could not name the person and the moment, or if a decision ` +
  `is genuinely the owner's — list those in blockers rather than choosing for them.`,
  { label: `ux:${slug}`, phase: 'UX', agentType: 'product-planner', schema: STAGE_OUT },
)
if (!ux) throw new Error('UX stage returned nothing — rerun with resumeFromRunId')
if (!ux.ok) {
  log(`halted at UX: ${ux.blockers.length} question(s) for the owner`)
  return { stopped: 'UX', ux }
}
log(`UX done → ${ux.path}`)

/* ---------------------------------- 2. UI --------------------------------- */
phase('UI')
const ui = await agent(
  `Specify the interface for the flow in ${ux.path}, following your agent definition exactly.\n\n` +
  `Write docs/v2/plan/${slug}-ui.md. Load the emil-design-eng skill for interaction ` +
  `and motion craft; load awwwards only if this surface is public-facing.\n\n` +
  `Everything you specify must pass scripts/check-css-floor.sh — run it.\n\n` +
  `Set ok=false if ${ux.path} left a product decision open; name it in blockers ` +
  `instead of deciding it yourself.`,
  { label: `ui:${slug}`, phase: 'UI', agentType: 'ui-designer', schema: STAGE_OUT },
)
if (!ui) throw new Error('UI stage returned nothing — rerun with resumeFromRunId')
if (!ui.ok) {
  log(`halted at UI: ${ui.blockers.length} question(s) back to UX`)
  return { stopped: 'UI', ux, ui }
}
log(`UI done → ${ui.path}`)

/* ------------------------------- 3. the cut ------------------------------- */
/* A real barrier: the build fan-out needs both cuts at once, because the order
 * groups interleave across the two sides -- the auth slice is backend and the
 * screens that depend on it are frontend. */
phase('Cut')
const NO_GIT = `Builders must not run any git command: they work concurrently in one tree and the integrator commits.`
/* parallel(), not Promise.all: a thunk that throws becomes null here instead of
 * rejecting the whole run, and a cut that failed is recoverable. */
const [feCut, beCut] = await parallel([() =>
  agent(
    `Cut the client work for ${ui.path} into independent build slices, following your ` +
    `agent definition exactly. Write docs/v2/plan/${slug}-frontend-slices.md.\n\n` +
    `Do NOT dispatch builders — this workflow dispatches them from your cut. Each slice's ` +
    `brief must stand alone: the spec section quoted, the exact signatures it exports and ` +
    `consumes, and the check it must add. ${NO_GIT}\n\n` +
    `Shared primitives get order 0; screens that consume them get a higher order. ` +
    `No two slices may list the same file.`,
    { label: `cut:frontend`, phase: 'Cut', agentType: 'frontend-lead', schema: CUT },
  ), () =>
  agent(
    `Publish the contract and cut the server work for ${ux.path} and ${ui.path}, following ` +
    `your agent definition exactly. Write docs/v2/plan/${slug}-contract.md first, then ` +
    `docs/v2/plan/${slug}-backend-slices.md.\n\n` +
    `Do NOT dispatch builders — this workflow dispatches them from your cut. ${NO_GIT}\n\n` +
    `Auth and redaction are order 0. No two slices may list the same file.`,
    { label: `cut:backend`, phase: 'Cut', agentType: 'backend-lead', schema: CUT },
  )])

const slices = [
  ...((feCut && feCut.slices) || []).map((s) => ({ ...s, side: 'frontend' })),
  ...((beCut && beCut.slices) || []).map((s) => ({ ...s, side: 'backend' })),
]
if (!slices.length) throw new Error('no slices came back from either lead')

/* A file claimed by two slices is two builders overwriting each other. Catch it
 * here, in code, rather than discovering it as a lost edit at assembly. */
const owner = new Map()
const clashes = []
for (const s of slices) {
  for (const f of s.files || []) {
    if (owner.has(f)) clashes.push(`${f}: ${owner.get(f)} and ${s.id}`)
    else owner.set(f, s.id)
  }
}
if (clashes.length) {
  log(`the cut is wrong — ${clashes.length} file(s) claimed twice`)
  return { stopped: 'Cut', clashes, feCut, beCut }
}

const orders = [...new Set(slices.map((s) => s.order))].sort((a, b) => a - b)
log(`${slices.length} slices across ${orders.length} dependency group(s)`)

/* --------------------------------- 4. build ------------------------------- */
/* Group by order, parallel inside a group, barrier between groups. The barrier
 * is the dependency: a screen cannot be built against a primitive that is not
 * there yet. Within a group the slices are independent by construction, which
 * the clash check above is what makes true. */
phase('Build')
const built = []
for (const order of orders) {
  const group = slices.filter((s) => s.order === order)
  const results = await parallel(group.map((s) => () =>
    agent(
      `Build exactly this one slice and nothing else.\n\n` +
      `SLICE: ${s.id} — ${s.title}\nYOU MAY EDIT ONLY: ${s.files.join(', ')}\n\n${s.brief}\n\n` +
      `Then: run scripts/predeploy-gate.sh and scripts/check-css-floor.sh, both green. ` +
      `Then prove your check is a tripwire — break your own feature, confirm your check ` +
      `is what fails, put it back. ${NO_GIT}`,
      { label: `build:${s.id}`, phase: 'Build', agentType: 'builder', schema: BUILT },
    )))
  const ok = results.filter(Boolean)
  built.push(...ok)
  const bad = ok.filter((r) => r.status === 'BLOCKED')
  log(`group ${order}: ${ok.length}/${group.length} returned, ${bad.length} blocked`)
  if (bad.length) {
    /* Blocked at order N means every higher order was written against something
     * that does not exist. Stop; do not spend the rest of the fan-out on it. */
    return { stopped: 'Build', order, blocked: bad, built, feCut, beCut }
  }
}

/* ------------------------------- 5. assemble ----------------------------- */
phase('Assemble')
const assembly = await agent(
  `Assemble the slices just built for "${slug}" into one working whole, following your ` +
  `agent definition exactly.\n\nSlices built, in the order they landed:\n` +
  built.map((b) => `- ${b.id} (${b.status}): ${b.files.join(', ')}`).join('\n') +
  `\n\nThe plan is in ${ux.path}, ${ui.path} and docs/v2/plan/${slug}-contract.md.\n` +
  `Write docs/v2/plan/${slug}-assembly.md. You commit; the builders did not.\n` +
  `Re-measure what the UX doc promised and write down what it actually says, ` +
  `including when it is worse.`,
  { label: `assemble:${slug}`, phase: 'Assemble', agentType: 'integrator', schema: STAGE_OUT },
)

/* --------------------------------- 6. review ------------------------------ */
/* Three reviewers with different lenses rather than three of the same: a thing
 * that is correct can still be unusable on a Core 2 Duo, and a thing that is
 * both can still be visible to a role that must not see it. */
phase('Review')
const LENSES = [
  ['authorization', 'Every role that must not reach this — confirm the SERVER refuses it, not that the button is hidden. Check that a route with no permission entry is closed by default.'],
  ['the flow', 'Walk it locally as the role that does this job. Count the taps against what the UX doc promised. Check every state the UI spec listed: empty, one, far too many, offline, half-finished, no permission.'],
  ['the floor', 'Chrome 109 on a Core 2 Duo. Run scripts/check-css-floor.sh. Re-measure the budgets on the fleet-sized fixture rather than trusting the assembly doc. Break two checks and confirm the gate goes red.'],
]
const reviews = await parallel(LENSES.map(([lens, how]) => () =>
  agent(
    `Review the assembled "${slug}" through one lens only: ${lens}.\n\n${how}\n\n` +
    `Against ${ux.path}, ${ui.path}, docs/v2/plan/${slug}-contract.md and ` +
    `docs/v2/plan/${slug}-assembly.md.\n\n` +
    `Verify every finding by constructing the concrete failing case before you report it. ` +
    `If you cannot, drop it or say you could not verify it — do not report a hunch. ` +
    `Write docs/v2/reviews/${slug}-${lens.replace(/\s+/g, '-')}.md.`,
    { label: `review:${lens}`, phase: 'Review', agentType: 'reviewer', schema: STAGE_OUT },
  )))

return {
  slug,
  ux: ux.path,
  ui: ui.path,
  contract: `docs/v2/plan/${slug}-contract.md`,
  slices: slices.map((s) => ({ id: s.id, side: s.side, order: s.order })),
  built: built.map((b) => ({ id: b.id, status: b.status, gate: b.gateAfter, tripwire: b.tripwire })),
  assembly: assembly && assembly.path,
  reviews: reviews.filter(Boolean).map((r) => ({ path: r.path, ok: r.ok, summary: r.summary })),
  blockers: [...ux.blockers, ...ui.blockers, ...(assembly ? assembly.blockers : [])],
}
