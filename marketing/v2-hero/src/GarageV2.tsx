import { Bar, Button, Collapse, Count, Row, Stage, Text, Window, type Act } from '../kit'
import { Icon, type IconName } from './icons'
import './garage.css'

// Garage Saathi v2's hero: five screens that each asked "what is wrong?" became
// one ranked list. The demo acts on the top thing in it and the list gets
// shorter -- which is the whole argument for the rewrite, in one motion.
//
// Every string here is the app's own, lifted from v2/screens/attention.js and
// today.js. The voice is the product: "Standing 3 hours.", "Held at the gate.",
// plain sentences a driver reads at a gate at night, never dashboard nouns.

type S = {
  /** The detail card for the held bus. */
  card: boolean
  /** The job card has been opened from it. */
  opened: boolean
  /** The held-bus row is still in the list. */
  listed: boolean
  /** The count in the title bar. */
  count: number
}

const initial: S = { card: false, opened: false, listed: true, count: 7 }

// The result left on screen: the card confirmed, the row gone, the count down.
const POSTER: S = { card: true, opened: true, listed: false, count: 6 }

// Clear of both halves of the payoff: the count top right, the card right.
const REST = { wide: { x: 330, y: 296 }, compact: { x: 176, y: 214 } }

// Tonight's departures in the quiet pane: a fleet's own shape, buses by number
// and the hour they leave.
const TONIGHT: [string, string][] = [
  ['1409 Satara', '21:40'],
  ['1122 Kolhapur', '22:05'],
  ['1318 Nashik', '22:30'],
  ['1407 Solapur', '23:15'],
  ['1265 Ratnagiri', '23:50'],
  ['1511 Goa', '00:20'],
  ['1203 Karad', '00:45'],
]

const RAIL: { icon: IconName; label: string }[] = [
  { icon: 'home', label: 'Today' },
  { icon: 'warn', label: 'Attention' },
  { icon: 'job', label: 'Work' },
  { icon: 'gate', label: 'Duty' },
  { icon: 'bus', label: 'Buses' },
  { icon: 'part', label: 'Store' },
  { icon: 'money', label: 'Money' },
  { icon: 'person', label: 'People' },
]

async function script(a: Act<S>) {
  await a.wait(700)

  // 1. The top of the list is the thing that needs a person.
  await a.move({ at: 'row-0', x: 0.84, y: 0.44 })
  await a.wait(420)
  await a.click()
  await a.set({ card: true })
  await a.wait(1100)

  // 2. Open a job card for it, from the check that held it.
  await a.move('open-job')
  await a.wait(360)
  await a.click()
  await a.set({ opened: true })
  await a.wait(820)

  // 3. The payoff: it leaves the list, and the count follows it down.
  await a.set({ listed: false, count: 6 })
  await a.move('rest')
  await a.wait(2400)

  // Reset: the panel closes first, then the scene JUMPS back rather than
  // easing. `set` would have rolled the count 6 -> 7 in view, which is a
  // figure rewinding with no cause -- the one thing a loop must never show.
  await a.set({ card: false })
  await a.wait(620)
  // The row comes back on its own Collapse, so it has an entrance rather than
  // popping in whole; the count follows it, snapped, so 6 never eases back to
  // 7 in view. The row returning is the cause the viewer reads for both.
  await a.set({ listed: true })
  await a.wait(420)
  await a.snap({ ...initial })
  await a.wait(320)
}

export function GarageV2() {
  return (
    <Stage
      width={720}
      height={340}
      compact={{ below: 600, width: 358, height: 300 }}
      initial={initial}
      poster={POSTER}
      script={script}
      fidelity="standard"
      cursor={{ at: REST }}
      className="gs"
    >
      {(s, _rect, layout) => (
        <>
          <Window
            className="gs-app"
            sidebarWidth={layout === 'compact' ? 54 : 140}
            title="Attention"
            toolbar={
              <span className="gs-need">
                <Count value={s.count} /> need you
              </span>
            }
            body={{ className: 'gs-body' }}
            sidebar={
              <nav className="gs-rail">
                {RAIL.map((item) => (
                  <span key={item.label} className="gs-rail-item" data-on={item.label === 'Attention' || undefined}>
                    <Icon name={item.icon} size={16} />
                    <span className="gs-rail-label">{item.label}</span>
                  </span>
                ))}
              </nav>
            }
          >
            <div className="gs-list">
              {/* The three rows the story is about carry words; the rest are
                  the product's filler, so the eye lands on the top one. */}
              <Collapse open={s.listed} reveal="drop">
                <Row
                  data-target="row-0"
                  data-cursor="pointer"
                  className="gs-row"
                  lead={
                    <span className="gs-tile" data-tone="bad">
                      <Icon name="gate" size={14} />
                    </span>
                  }
                  title="Bus 1234 held at the gate"
                  subtitle="Standing 3 hours."
                />
              </Collapse>
              <Row
                className="gs-row"
                lead={
                  <span className="gs-tile" data-tone="warn">
                    <Icon name="doc" size={14} />
                  </span>
                }
                title="Fitness expires in 6 days"
                subtitle="Papers"
              />
              <Row
                className="gs-row"
                lead={
                  <span className="gs-tile" data-tone="warn">
                    <Icon name="part" size={14} />
                  </span>
                }
                title="Brake pads, 2 left"
                subtitle="Low stock"
              />
              {[
                [126, 64],
                [104, 78],
                [138, 58],
                [112, 70],
              ].map(([t, sub], i) => (
                <Row
                  key={i}
                  className="gs-row"
                  lead={<Bar w={26} h={26} r={7} tone={2} />}
                  title={<Bar w={t} h={7} tone={3} />}
                  subtitle={<Bar w={sub} h={6} tone={2} />}
                />
              ))}
            </div>

            {/* The quiet margin the detail card lands over. Its rows run off
                the bottom bleed so the pane is full at every frame. */}
            <aside className="gs-aside">
              <Text className="gs-aside-title">Going out tonight</Text>
              {/* One line a row, as a narrow pane wants. `Text filler` writes
                  the words at realistic fidelity and draws a bar at the others,
                  so the pane is written once and the stage decides. */}
              <div className="gs-aside-list">
                {TONIGHT.map(([bus, out]) => (
                  <span key={bus} className="gs-aside-row">
                    <span className="gs-tile gs-tile--quiet">
                      <Icon name="bus" size={13} />
                    </span>
                    <Text filler className="gs-aside-name">
                      {bus}
                    </Text>
                    <Text filler className="gs-aside-out">
                      {out}
                    </Text>
                  </span>
                ))}
              </div>
            </aside>

            {/* Anchored UI, not a satellite: the panel the app opens over its
                own right-hand pane, never over the list it came from. Every
                line in it starts at one left edge. */}
            <div className="gs-detail" data-show={s.card || undefined}>
              <div className="gs-detail-head">
                <Text className="gs-detail-title">Gate check</Text>
                <Text className="gs-detail-sub">Bus 1234</Text>
              </div>
              <div className="gs-fail">
                <Icon name="warn" size={14} />
                <Text className="gs-fail-text">Brakes, failed</Text>
              </div>
              <Text className="gs-detail-when">Checked 3 hours ago.</Text>
              <div className="gs-detail-foot">
                <Button
                  variant="primary"
                  size="small"
                  data-target="open-job"
                  data-cursor="hand"
                  icon={s.opened ? <Icon name="ok" size={14} /> : undefined}
                >
                  {s.opened ? 'Job card open' : 'Open job card'}
                </Button>
              </div>
            </div>
          </Window>

          <span
            data-target="rest"
            style={{ position: 'absolute', left: REST[layout].x, top: REST[layout].y }}
          />
        </>
      )}
    </Stage>
  )
}
