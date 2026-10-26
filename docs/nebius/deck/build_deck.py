"""Builds the Nebius x NVIDIA submission deck for ResponseCompass (final version, round 48 review applied).

Structure follows the AMD deck (docs/nebius/deck/AMDResponseCompass-deck.pptx): the same backgrounds,
palette and type scale, with the Nebius features added. Diagram boxes and arrows are native shapes;
arrows are glued connectors, so they follow a box when it is moved in PowerPoint.

Run from the repository root:  python3 docs/nebius/deck/build_deck.py
Needs python-pptx (pip install python-pptx). Output: docs/nebius/deck/ResponseCompass-nebius-deck.pptx
"""

from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUT = HERE / "ResponseCompass-nebius-deck.pptx"

FONT = "Inter"
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
INK = RGBColor(0x11, 0x18, 0x27)
BODY = RGBColor(0x47, 0x54, 0x67)
MUTED = RGBColor(0x66, 0x70, 0x85)
INDIGO = RGBColor(0x4F, 0x46, 0xE5)
INDIGO_INK = RGBColor(0xE0, 0xE7, 0xFF)
NAVY = RGBColor(0x1E, 0x1B, 0x4B)
TINT = RGBColor(0xEE, 0xF0, 0xFF)
LIGHT = RGBColor(0xA5, 0xB4, 0xFC)
RULE = RGBColor(0xD0, 0xD5, 0xDD)
AMBER_FILL = RGBColor(0xFF, 0xF7, 0xED)
AMBER = RGBColor(0xD9, 0x77, 0x06)
AMBER_INK = RGBColor(0x92, 0x40, 0x0E)

# Node kinds follow the legend: application code, Nemotron model, store, people.
KINDS = {
    "app": (WHITE, RULE, INK, BODY),
    "model": (INDIGO, INDIGO, WHITE, INDIGO_INK),
    "store": (NAVY, NAVY, WHITE, LIGHT),
    "people": (AMBER_FILL, AMBER, INK, BODY),
}
LEGEND = [("app", "Application code"), ("model", "Nemotron model"), ("store", "Store"), ("people", "People")]

BG = {"cover": ASSETS / "bg-cover.png", "art": ASSETS / "bg-art.png", "plain": ASSETS / "bg-plain.png"}

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
page_no = 0


def rgb_text(run, size, bold=False, color=INK):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return run


def text(slide, x, y, w, h, value, size=14, bold=False, color=BODY, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, space_after=0):
    """A text box. `value` is a string (newlines start new paragraphs) or a list of strings."""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    frame = box.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = anchor
    frame.margin_left = frame.margin_right = Inches(0.02)
    frame.margin_top = frame.margin_bottom = Inches(0.02)
    lines = value if isinstance(value, list) else value.split("\n")
    for i, line in enumerate(lines):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.alignment = align
        para.space_after = Pt(space_after)
        rgb_text(para.add_run(), size, bold, color).text = line
    return box


def card(slide, x, y, w, h, fill=WHITE, line=RULE, dashed=False, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    shp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        shp.adjustments[0] = 0.06
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    shp.line.color.rgb = line
    shp.line.width = Pt(1)
    if dashed:
        shp.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    shp.shadow.inherit = False
    return shp


def node(slide, x, y, w, h, title, sub, kind="app", dashed=False):
    """A diagram box. Glue connectors to it with link(); sites: 0 top, 1 left, 2 bottom, 3 right."""
    fill, line, ink, sub_ink = KINDS[kind]
    shp = card(slide, x, y, w, h, fill=fill, line=line, dashed=dashed)
    frame = shp.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    frame.margin_left = frame.margin_right = Inches(0.06)
    frame.margin_top = frame.margin_bottom = Inches(0.03)
    head = frame.paragraphs[0]
    head.alignment = PP_ALIGN.CENTER
    rgb_text(head.add_run(), 12, True, ink).text = title
    if sub:
        body = frame.add_paragraph()
        body.alignment = PP_ALIGN.CENTER
        rgb_text(body.add_run(), 9.5, False, sub_ink).text = sub
    return shp


def link(slide, a, site_a, b, site_b, color=MUTED, dashed=False):
    """A straight connector glued to two shapes, with an arrowhead at the end."""
    conn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, 0, 0, Inches(1), Inches(1))
    conn.begin_connect(a, site_a)
    conn.end_connect(b, site_b)
    conn.line.color.rgb = color
    conn.line.width = Pt(1.5)
    if dashed:
        conn.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    ln = conn.line._get_or_add_ln()
    etree.SubElement(ln, qn("a:tailEnd"), type="triangle", w="med", len="med")
    return conn


def new_slide(background="plain", notes=None):
    global page_no
    page_no += 1
    slide = prs.slides.add_slide(BLANK)
    pic = slide.shapes.add_picture(str(BG[background]), 0, 0, prs.slide_width, prs.slide_height)
    tree = slide.shapes._spTree
    tree.remove(pic._element)
    tree.insert(2, pic._element)
    if notes:
        slide.notes_slide.notes_text_frame.text = notes
    return slide


def header(slide, eyebrow, title, subtitle=None):
    text(slide, 0.6, 0.42, 12.1, 0.3, eyebrow.upper(), size=11, bold=True, color=INDIGO)
    text(slide, 0.6, 0.74, 12.1, 0.62, title, size=32, bold=True, color=INK)
    if subtitle:
        text(slide, 0.6, 1.4, 12.1, 0.35, subtitle, size=14, color=BODY)
    text(slide, 12.2, 7.0, 0.5, 0.3, str(page_no), size=10, color=MUTED, align=PP_ALIGN.RIGHT)


def legend(slide, kinds=("app", "model", "store", "people")):
    x = 6.2
    labels = dict(LEGEND)
    for kind in kinds:
        fill, line, _, _ = KINDS[kind]
        card(slide, x, 0.47, 0.32, 0.2, fill=fill, line=line)
        text(slide, x + 0.42, 0.46, 1.6, 0.28, labels[kind], size=10, color=BODY)
        x += 0.42 + len(labels[kind]) * 0.075 + 0.35


def shot(slide, name, x, y, w, label=None):
    """A live screenshot in a navy frame, with an optional label chip at its lower right."""
    h = w * 9 / 16
    frame = card(slide, x - 0.08, y - 0.08, w + 0.16, h + 0.16, fill=NAVY, line=NAVY)
    frame.adjustments[0] = 0.03
    slide.shapes.add_picture(str(ASSETS / name), Inches(x), Inches(y), Inches(w), Inches(h))
    if label:
        chip = card(slide, x + w - 1.55, y + h - 0.4, 1.4, 0.3, fill=NAVY, line=NAVY)
        chip.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
        para = chip.text_frame.paragraphs[0]
        para.alignment = PP_ALIGN.CENTER
        rgb_text(para.add_run(), 10, True, WHITE).text = label


def metric(slide, x, y, w, h, value, caption, accent=False, value_size=34):
    fill = INDIGO if accent else WHITE
    ink = WHITE if accent else INDIGO
    cap = INDIGO_INK if accent else BODY
    card(slide, x, y, w, h, fill=fill, line=INDIGO if accent else RULE)
    text(slide, x + 0.3, y + 0.2, w - 0.6, 0.7, value, size=value_size, bold=True, color=ink)
    text(slide, x + 0.3, y + 0.95, w - 0.6, h - 1.05, caption, size=13, color=cap)


def item(slide, x, y, number, title, body, width=5.2):
    chip = card(slide, x, y, 0.5, 0.5, fill=INDIGO, line=INDIGO, shape=MSO_SHAPE.OVAL)
    frame = chip.text_frame
    frame.word_wrap = False
    frame.margin_left = frame.margin_right = 0
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    para = frame.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER
    rgb_text(para.add_run(), 12, True, WHITE).text = number
    text(slide, x + 0.72, y - 0.08, width, 0.4, title, size=15, bold=True, color=INK)
    text(slide, x + 0.72, y + 0.27, width, 0.6, body, size=12.5, color=BODY)


def table(slide, x, y, w, rows, col_widths, row_h=0.42, size=12):
    shape = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y), Inches(w), Inches(row_h * len(rows)))
    grid = shape.table
    for c, cw in enumerate(col_widths):
        grid.columns[c].width = Inches(cw)
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            cell = grid.cell(r, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = NAVY if r == 0 else (WHITE if r % 2 else TINT)
            cell.margin_left = cell.margin_right = Inches(0.08)
            frame = cell.text_frame
            frame.word_wrap = True
            rgb_text(frame.paragraphs[0].add_run(), size, r == 0, WHITE if r == 0 else INK).text = value
    return shape


def placeholder(slide, x, y, w, h, title, body):
    shp = card(slide, x, y, w, h, fill=AMBER_FILL, line=AMBER, dashed=True)
    frame = shp.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    frame.margin_left = frame.margin_right = Inches(0.25)
    rgb_text(frame.paragraphs[0].add_run(), 13, True, AMBER_INK).text = title
    rgb_text(frame.add_paragraph().add_run(), 12, False, AMBER_INK).text = body


# 1. Cover ------------------------------------------------------------------------------
s = new_slide("cover", notes=(
    "ResponseCompass is a dispatch agent for operations control rooms, built for the Nebius x NVIDIA "
    "hackathon on Nemotron models through Nebius Token Factory. Technicians describe faults in their own "
    "words; code establishes the facts; Nemotron ranks and drafts; people approve the decisions that matter."))
text(s, 0.6, 5.0, 5.6, 0.9, ["Nebius x NVIDIA Global AI Hackathon · Best Apps and Agents",
                             "Nemotron 3 Ultra, Nemotron 3 Super and Nemotron 3.5 Lightning on Nebius Token Factory"],
     size=13, color=MUTED, space_after=4)

# 2. Problem ----------------------------------------------------------------------------
s = new_slide("art", notes=(
    "Proximity is easy to compute and easy to defend, but it ignores fit. What matters is who is likely to "
    "resolve this class of issue on the first attempt, with which procedure, and whether the shift can cover "
    "the backlog. Reports also arrive as free text, not clean tickets."))
header(s, "The problem", "Closest is not best")
item(s, 0.6, 1.9, "01", "Nearest is not most experienced.", "The closest technician may never have fixed this fault.")
item(s, 0.6, 3.1, "02", "The first fix is often a guess.", "A wrong guess means a reopened issue and another trip.")
item(s, 0.6, 4.3, "03", "Reports arrive as free text.", "\"The transfer keeps stopping short\" must become an equipment, a symptom and a set of past cases.")
item(s, 0.6, 5.5, "04", "Backlogs force overtime calls.", "Who may legally stay on, and who covers the most work?")

# 3. What is new for Nebius (disclosure) -----------------------------------------------
s = new_slide("plain", notes=(
    "The project existed before this hackathon: it was built for an earlier AMD hackathon. We claim only the work "
    "after baseline 1e1c69c. The full disclosure, with commit counts, is HACKATHON_CHANGES.md in the repository."))
header(s, "What is new for Nebius", "Existing foundation, new Nebius work",
       "The control-room product existed before this entry. The Nebius work is listed on the right.")
card(s, 0.6, 2.0, 5.7, 4.5, fill=WHITE, line=RULE)
text(s, 0.9, 2.2, 5.1, 0.4, "Existing foundation (before baseline 1e1c69c)", size=15, bold=True, color=INK)
text(s, 0.9, 2.75, 5.1, 3.6,
     ["A persistent simulated control room with deterministic eligibility, metrics and outcomes.",
      "Wall-display screens, operator console and Offline mode.",
      "Hidden responder skill and hidden fault cause, never shown to a model or screen.",
      "Analytics, Issue Pareto and baselines.",
      "Built for an earlier AMD hackathon; that entry is disclosed in the repository."],
     size=13, color=BODY, space_after=8)
card(s, 6.6, 2.0, 6.1, 4.5, fill=INDIGO, line=INDIGO)
text(s, 6.9, 2.2, 5.5, 0.4, "Added for Nebius (after baseline 1e1c69c)", size=15, bold=True, color=WHITE)
text(s, 6.9, 2.75, 5.5, 3.6,
     ["Field reports and the Compass Investigator: Nemotron 3 Ultra in a bounded, read-only tool loop.",
      "Citation, catalog and safety checks in code, and a single dispatch gate on every assignment.",
      "Nebius Token Factory provider, with a Nemotron model chosen per role and per-model thinking control.",
      "Paired evaluation harness, usage ledger and budget, and the Investigator checks on this deck.",
      "Guest workplaces with a per-username workplace and a ten-username cap."],
     size=13, color=INDIGO_INK, space_after=8)

# 4. Field report (new) -----------------------------------------------------------------
s = new_slide("plain", notes=(
    "A field report is untrusted text. The hazard and input policy runs in code before any model call. "
    "Nemotron 3 Super ranks interpretations from candidates the code resolved; the operator confirms the "
    "symptom. Nothing is dispatched from this step."))
header(s, "Field reports", "A report, not a ticket",
       "Technicians describe faults in their own words. Code turns the words into facts; the model only ranks.")
card(s, 0.6, 2.0, 5.9, 1.9, fill=WHITE, line=RULE)
text(s, 0.9, 2.2, 5.3, 0.3, "FIELD REPORT · UNTRUSTED TEXT", size=10, bold=True, color=MUTED)
text(s, 0.9, 2.55, 5.4, 1.2, "\"Station 12: the transfer keeps stopping short of the end position every few cycles.\"",
     size=18, bold=True, color=INK)
xs = [0.6, 3.8, 7.0, 10.2]
flow = [
    ("Technician report", "free text, typed on the floor", "people"),
    ("Code resolves facts", "equipment, history, hazard policy", "app"),
    ("Nemotron 3 Super", "ranks up to 12 interpretations", "model"),
    ("Operator confirms", "symptom and equipment, by a person", "people"),
]
nodes = [node(s, x, 4.45, 2.5, 1.05, t, sub, kind) for x, (t, sub, kind) in zip(xs, flow)]
for a, b in zip(nodes, nodes[1:]):
    link(s, a, 3, b, 1)
text(s, 0.6, 5.85, 12.1, 0.6,
     "Interpretations come only from candidates code resolved from the report. A report whose equipment does not "
     "resolve is not investigated. Without enough history, the Investigator abstains rather than guesses.",
     size=13, color=BODY)

# 5. Control room -----------------------------------------------------------------------
s = new_slide("plain", notes=(
    "A control room puts the floor map, the issue queue, the dispatch context, the event feed, the Issue Pareto "
    "and analytics on separate monitors (/rooms/<room>/display/<screen>). Staffing, station KPIs, loadboards "
    "and field reports are panels too. The operator console, with override and approval controls, is the "
    "seventh screen. Captured live from a local build on the synthetic plant-1 month."))
header(s, "Control room", "One agent, many screens",
       "Each panel runs full screen on its own monitor; the operator console keeps the controls.")
tiles = [("screen-map.png", "Floor map"), ("screen-issues.png", "Issues"), ("screen-dispatch.png", "Dispatch"),
         ("screen-events.png", "Event feed"), ("screen-pareto.png", "Issue Pareto"), ("screen-analytics.png", "Analytics")]
for i, (name, label) in enumerate(tiles):
    col, row = i % 3, i // 3
    shot(s, name, 0.6 + col * 4.1, 2.0 + row * 2.45, 3.75, label)

# 6. How it runs: two labelled paths ------------------------------------------------------
s = new_slide("plain", notes=(
    "Two paths share one dispatch gate. Ordinary dispatch: an issue is raised, Super ranks eligible responders, an "
    "offer goes out, and the responder accepts or rejects. Field-report investigation: a technician's report is "
    "confirmed by the operator, Ultra runs the bounded investigation, and a person approves the recommended responder "
    "and fix before any assignment. The outcome feeds observed history. Overtime is a separate branch: Super ranks "
    "lawful options and central command decides."))
header(s, "How it runs", "Two paths, one dispatch gate",
       "Ordinary dispatch runs on its own. A field report waits for the operator and an approval before any assignment.")
text(s, 0.45, 1.85, 6.0, 0.3, "ORDINARY DISPATCH", size=10, bold=True, color=MUTED)
text(s, 0.45, 3.45, 8.0, 0.3, "FIELD REPORT · INVESTIGATION", size=10, bold=True, color=MUTED)
text(s, 0.45, 5.05, 6.0, 0.3, "OVERTIME", size=10, bold=True, color=MUTED)
xs = [0.45, 2.55, 4.65, 6.75, 8.85, 10.95]
w = 1.8
a1 = node(s, xs[0], 2.2, w, 0.8, "Issue raised", "equipment fault", "app")
a2 = node(s, xs[1], 2.2, w, 0.8, "Rank responders", "Super, eligible only", "model")
a3 = node(s, xs[2], 2.2, w, 0.8, "Offer sent", "automatic, ranked", "app")
a4 = node(s, xs[3], 2.2, w, 0.8, "Responder", "accepts or rejects", "people")
a5 = node(s, xs[4], 2.2, w, 0.8, "Rank fixes", "Super, catalog procedures", "model")
a6 = node(s, xs[5], 2.2, w, 0.8, "Repair attempt", "outcome from hidden truth", "app")
for p, q in zip([a1, a2, a3, a4, a5], [a2, a3, a4, a5, a6]):
    link(s, p, 3, q, 1)
b1 = node(s, xs[0], 3.8, w, 0.8, "Field report", "technician text, untrusted", "people")
b2 = node(s, xs[1], 3.8, w, 0.8, "Super ranks", "interpretations, up to 12", "model")
b3 = node(s, xs[2], 3.8, w, 0.8, "Operator confirms", "symptom and equipment", "people")
b4 = node(s, xs[3], 3.8, w, 0.8, "Ultra investigates", "six read-only tools", "model")
b5 = node(s, xs[4], 3.8, w, 0.8, "Operator approves", "the gate opens here", "people")
b6 = node(s, xs[5], 3.8, w, 0.8, "Assign", "responder and fix", "app")
for p, q in zip([b1, b2, b3, b4, b5], [b2, b3, b4, b5, b6]):
    link(s, p, 3, q, 1)
c1 = node(s, xs[0], 5.4, w, 0.8, "Backlog review", "before each handover", "app")
c2 = node(s, xs[1], 5.4, w, 0.8, "Rank overtime", "Super, legal options", "model")
c3 = node(s, xs[2], 5.4, w, 0.8, "Central command", "approves or rejects", "people")
link(s, c1, 3, c2, 1)
link(s, c2, 3, c3, 1)
st = node(s, xs[4], 5.4, 2.0, 0.8, "Observed history", "evidence for every ranking", "store")
link(s, a6, 2, st, 0)
link(s, b6, 2, st, 0)
text(s, 8.85, 6.3, 4.1, 0.6, "Central command can override, transfer or add support at any time.",
     size=12, color=BODY)

# 7. Architecture -------------------------------------------------------------------------
s = new_slide("plain", notes=(
    "Code owns time, facts, eligibility, baselines, the dispatch gate and every mutation. Models rank or propose; "
    "they never act. The ranker receives application-owned evidence and ranks only the candidates it is given. "
    "The Investigator quotes only what its tools returned, and the validator checks every citation. The planner "
    "proposes synthetic incidents; the validator checks each proposal. If a model is slow, rate-limited or returns "
    "invalid output, the deterministic path takes over."))
header(s, "Architecture", "Code owns the facts. Models only rank.",
       "Code owns time, facts, eligibility, baselines, the dispatch gate and every mutation. Models rank or propose.")
legend(s)
clock = node(s, 0.45, 1.95, 2.05, 0.72, "Simulation clock", "persistent, pausable", "app")
sched = node(s, 0.45, 3.15, 2.05, 0.72, "Scheduler", "one-shot, restart-safe", "app")
resp = node(s, 0.45, 4.4, 2.05, 0.72, "Responders", "accept or reject", "people")
disp = node(s, 0.45, 5.6, 2.05, 0.72, "Dispatch", "ranked offer queue", "app")
evp = node(s, 3.1, 1.95, 2.05, 0.72, "Event planner", "Nemotron 3.5 Lightning", "model")
fbp = node(s, 3.1, 3.15, 2.05, 0.72, "Fallback planner", "deterministic, API-free", "app")
comp = node(s, 3.1, 5.05, 2.05, 0.72, "Compass", "Nemotron 3 Super ranks", "model")
base = node(s, 3.1, 6.2, 2.05, 0.72, "Baselines", "nearest + naive score", "app")
inv = node(s, 5.75, 1.95, 2.05, 0.72, "Investigator", "Nemotron 3 Ultra", "model")
val = node(s, 5.75, 3.0, 2.05, 0.72, "Validator and gate", "schema, facts, one dispatch gate", "app")
ctx = node(s, 5.75, 5.4, 2.05, 0.72, "Context engine", "eligibility, travel, history", "app")
state = node(s, 5.5, 3.95, 2.55, 0.95, "Canonical state", "persistent store, audit trail", "store")
cmd = node(s, 9.0, 2.9, 2.55, 0.72, "Central command", "approves, overrides", "people")
narr = node(s, 9.0, 1.95, 2.55, 0.72, "Narrator", "Nemotron 3.5 Lightning", "model")
live = node(s, 9.0, 3.99, 2.55, 0.72, "Live Floor & Analytics", "UI, fixed snapshots", "app")
res = node(s, 9.0, 5.4, 2.55, 0.72, "Resolution engine", "hidden skill, outcome", "app")
link(s, clock, 3, evp, 1)
link(s, sched, 3, fbp, 1)
link(s, evp, 2, val, 1)
link(s, fbp, 3, val, 1)
link(s, inv, 2, val, 0)
link(s, val, 2, state, 0)
link(s, state, 2, ctx, 0)
link(s, ctx, 1, comp, 3)
link(s, base, 3, ctx, 2)
link(s, comp, 0, fbp, 2, dashed=True)
link(s, state, 3, live, 1)
link(s, cmd, 1, val, 3)
link(s, state, 1, resp, 3)
link(s, resp, 2, disp, 0)
link(s, res, 1, state, 3)
link(s, narr, 1, cmd, 0)

# 8. Investigator (new) ---------------------------------------------------------------
s = new_slide("plain", notes=(
    "The Investigator runs Nemotron 3 Ultra in a bounded tool loop. Nemotron 3 Super ranks the interpretations first. "
    "Ultra reads past cases, catalog procedures and responder qualifications through six read-only tools. Every "
    "citation must be a record a tool returned. A person confirms the symptom, and the single dispatch gate accepts "
    "the assignment only after approval."))
header(s, "Compass Investigator", "Investigate before anyone is sent",
       "Super ranks the interpretations; Ultra runs six bounded, read-only tools; the operator approves before any dispatch.")
steps = [
    ("01 Read the report", "Hazard and input policy decided in code, before any model call."),
    ("02 Rank interpretations", "Nemotron 3 Super ranks up to 12 candidates that code resolved."),
    ("03 Tool loop", "Ultra reads past cases, catalog procedures and qualifications, read-only."),
    ("04 Check citations", "Every cited case or procedure must be one a tool returned."),
    ("05 Operator approves", "A person approves before assignment. Policy may approve safe cases only if a room enables it."),
]
cards_ = []
for n, (title, body) in enumerate(steps):
    x = 0.6 + n * 2.47
    c_ = card(s, x, 2.1, 2.1, 2.5, fill=WHITE, line=INDIGO if n in (1, 2) else RULE)
    cards_.append(c_)
    text(s, x + 0.18, 2.3, 1.8, 0.7, title, size=14, bold=True, color=INK)
    text(s, x + 0.18, 3.1, 1.8, 1.4, body, size=11.5, color=BODY)
for a_, b_ in zip(cards_, cards_[1:]):
    link(s, a_, 3, b_, 1)
placeholder(s, 0.6, 5.0, 12.1, 1.25, "Live capture pending",
            "The Nebius key is set on the deployment, and a live Nemotron call succeeded on 2026-10-26. Replace this box "
            "with a captured Investigator run before filing. Nothing here is a model output.")

# 9. Investigator safety (new) --------------------------------------------------------
s = new_slide("plain", notes=(
    "Field reports are data, not instructions. The policy in code decides what reaches the model, and the validators "
    "check what comes back. We do not claim that Nemotron verifies its own prose, and the controls are finite: a "
    "bounded lexicon and validators, not a proof of semantic correctness."))
header(s, "Compass Investigator", "Untrusted text, checked in code",
       "A field report is data, not instructions. Code decides what reaches the model and checks what comes back.")
safety = [
    ("Hazard policy in code", "Safety-sensitive reports are classified before any model call. A bounded lexicon, not the model, makes this decision."),
    ("Report text is data", "The report is quoted to the model as data. The model is not asked to follow instructions written inside it."),
    ("Citations checked", "A cited case or procedure must come from a tool result. Anything else is repaired or replaced by the deterministic path."),
    ("A person approves", "By default an operator approves. An audited policy may approve eligible safe cases only where a room enables it."),
]
for n, (title, body) in enumerate(safety):
    x = 0.6 + n * 3.05
    card(s, x, 2.0, 2.85, 3.6, fill=WHITE, line=RULE)
    text(s, x + 0.25, 2.25, 2.35, 0.8, title, size=16, bold=True, color=INK)
    text(s, x + 0.25, 3.15, 2.4, 2.3, body, size=13, color=BODY)
text(s, 0.6, 5.9, 12.1, 0.6,
     "Scenario checks, run 3: hazard and input policy decided with no model call in 6 of 6 scenarios. Finite test set, not a coverage guarantee.",
     size=13, color=MUTED)

# 10. Trust ---------------------------------------------------------------------------
s = new_slide("art", notes=(
    "We wanted the system to show Compass being wrong as well as right. Hidden truth plus baselines make its "
    "choices inspectable. Disagreement alone does not prove better outcomes."))
header(s, "Trust", "Honest by design")
for title, body, x, y in [
    ("Hidden truth", "True skill and true fault cause stay hidden from every model, screen and chart.", 0.6, 1.75),
    ("Outcomes from truth", "Repairs succeed or fail from that hidden truth, not from what a model claims.", 3.7, 1.75),
    ("Baselines alongside", "Nearest, naive score and most common fix run next to Compass; disagreements are recorded.", 0.6, 4.3),
    ("Fair analytics", "Denominators shown, thin samples suppressed, no leaderboard. Pay, seniority and HR data are never inputs.", 3.7, 4.3),
]:
    card(s, x, y, 2.85, 2.3, fill=WHITE, line=RULE)
    text(s, x + 0.25, y + 0.2, 2.4, 0.8, title, size=16, bold=True, color=INK)
    text(s, x + 0.25, y + 0.95, 2.4, 1.3, body, size=12.5, color=BODY)

# 11. Measured ranking (Nebius) -------------------------------------------------------
s = new_slide("plain", notes=(
    "Two measurements, both dated 2026-10-19 and both small samples. The generic probe uses one ranking prompt, five "
    "runs each. The Compass packets are the app's own ranking and planner packets, five samples each. Lightning "
    "truncated its reasoning at 1,024 tokens with thinking on, so thinking is switched off for it. These are validity "
    "results, not outcome accuracy or uptime guarantees."))
header(s, "Measured on Nebius", "Valid rankings, thinking off where it helps",
       "Dated 2026-10-19. Small samples: five runs or samples each. Validity only, not outcome accuracy.")
text(s, 0.6, 1.95, 7.4, 0.3, "Generic ranking probe, both supplied ids", size=12, bold=True, color=INK)
table(s, 0.6, 2.3, 7.4, [
    ["Model", "Thinking on (default)", "Thinking off"],
    ["Nemotron 3 Ultra", "5/5 · median 1.8 s", "5/5 · 0.8 s"],
    ["Nemotron 3 Super", "5/5 · 3.1 s", "5/5 · 0.9 s"],
    ["Nemotron 3.5 Lightning", "1/5 · truncated at 1,024 tokens", "5/5 · 0.7 s"],
    ["Nemotron 3 Nano", "5/5 · 3.9 s", "2/5 · omitted a candidate"],
], [2.5, 2.9, 2.0], row_h=0.45, size=12)
text(s, 0.6, 5.0, 7.4, 0.3, "Compass's own packets, thinking off", size=12, bold=True, color=INK)
table(s, 0.6, 5.35, 7.4, [
    ["Role", "Model", "Valid, time"],
    ["Responder, fix and staffing ranking", "Nemotron 3 Super", "5/5 · 3.2 s"],
    ["Event planner", "Nemotron 3.5 Lightning", "5/5 · 1.3 s"],
], [3.2, 2.5, 1.7], row_h=0.42, size=12)
card(s, 8.5, 2.0, 4.2, 2.6, fill=INDIGO, line=INDIGO)
text(s, 8.8, 2.2, 3.6, 0.5, "Thinking control", size=16, bold=True, color=WHITE)
text(s, 8.8, 2.75, 3.6, 1.8,
     "Each model maps to chat_template_kwargs.enable_thinking. Thinking is off for ranking by default; the "
     "Super packet with thinking on was slower and less consistent (4/5, 17.6 s).",
     size=13, color=INDIGO_INK)
text(s, 8.5, 4.9, 4.2, 1.5,
     "Ranking is validated in code. Output that fails validation falls back to the deterministic order, so dispatch never stops.",
     size=12, color=BODY)

# 12. Replay (Nebius) -----------------------------------------------------------------
s = new_slide("plain", notes=(
    "Paired replay on 60 held-out issues: the same responders, state and random draws in every arm, only the first "
    "fix differs. Run B and a repeat on the same code, run C, are both shown. In run B the Investigator ties the "
    "deterministic order; in run C it fell back to the deterministic path 23 times, and it did not beat the deterministic "
    "order. This is not a significance claim and does not show a gain over the deterministic order."))
header(s, "Measured on Nebius", "First-fix replay, two live runs",
       "60 held-out issues, the same responders, state and draws in every arm. Run B and a repeat, run C, on the same code.")
metric(s, 0.6, 2.0, 3.8, 1.9, "46 / 60", "Investigator, run B (repeat run C: 45 / 60)", accent=True)
metric(s, 4.75, 2.0, 3.8, 1.9, "46 / 60", "Deterministic order, same issues in both runs")
metric(s, 8.9, 2.0, 3.8, 1.9, "41 / 60", "Class-frequency baseline, same issues in both runs")
card(s, 0.6, 4.2, 12.1, 2.4, fill=WHITE, line=RULE)
text(s, 0.9, 4.4, 11.5, 0.4, "Fallbacks, discordant pairs and limits", size=16, bold=True, color=INK)
text(s, 0.9, 4.9, 11.5, 1.7,
     ["Run B: 7 of 60 first answers fell back; discordant pairs 7 Investigator-only vs 2 baseline-only, and 2 vs 2 against the deterministic order.",
      "Run C, same code: 23 of 60 fell back; discordant pairs 6 vs 2 against the baseline, and 2 vs 3 against the deterministic order.",
      "One window, 60 issues, one sample each. No significance claim, and no demonstrated gain over the deterministic order."],
     size=13, color=BODY, space_after=6)

# 13. Investigator checks (Nebius) ----------------------------------------------------
s = new_slide("plain", notes=(
    "Evaluation run 3 of the Investigator on Token Factory, after the security fixes. Citation validity counts only "
    "references the tools returned; it does not show that a rationale follows from a case. Accepted, repaired, "
    "deterministic and raw-invalid counts overlap and are not additive. Latency includes deterministic and "
    "injected-provider cases."))
header(s, "Measured on Nebius", "Investigator checks, run 3",
       "Scenario evaluation on Token Factory after the security fixes. 2026-10-19; a small, finite scenario set.")
metric(s, 0.6, 2.0, 2.85, 2.2, "24 / 24", "outcome class matches the expected class", accent=True, value_size=30)
metric(s, 3.7, 2.0, 2.85, 2.2, "60 / 60", "accepted citations were tool-returned references", value_size=30)
metric(s, 6.8, 2.0, 2.85, 2.2, "8 / 8", "abstention precision; recall is also 8 / 8", value_size=30)
metric(s, 9.9, 2.0, 2.85, 2.2, "6 / 6", "hazard and input policy decided with no model call", value_size=30)
card(s, 0.6, 4.6, 12.1, 2.0, fill=WHITE, line=RULE)
text(s, 0.9, 4.8, 11.5, 0.4, "What the counts mean", size=16, bold=True, color=INK)
text(s, 0.9, 5.25, 11.5, 1.4,
     ["Outcomes by path, overlapping and not additive: accepted 12, repaired 2, deterministic 11, raw invalid 2. Fallbacks are counted, not hidden.",
      "Investigation latency p50 10.5 s, p95 32.9 s (15 cases, including deterministic and injected-provider cases)."],
     size=13, color=BODY, space_after=6)

# 14. Staffing ------------------------------------------------------------------------
s = new_slide("plain", notes=(
    "Operator approval is the default. Legal limits are configured limits checked in code before the ranking sees an "
    "option. Rooms can opt into an audited auto-approve policy; the default is operator approval."))
header(s, "Staffing", "Overtime, decided by people",
       "Operator approval by default. Unanswered recommendations expire.")
chev = [("Backlog review", "app"), ("Lawful options only", "app"), ("Nemotron 3 Super ranks", "model"), ("Command approves", "people")]
for n, (label, kind) in enumerate(chev):
    fill, line, ink, _ = KINDS[kind]
    shp = card(s, 0.6 + n * 3.0, 2.0, 3.1, 0.72, fill=fill, line=line, shape=MSO_SHAPE.CHEVRON)
    shp.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    para = shp.text_frame.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER
    rgb_text(para.add_run(), 12, True, WHITE if kind == "model" else ink).text = label
item(s, 0.6, 3.2, "01", "Configured limits first", "16 h duty and 12 h rest limits, and the staffing cap, checked in code before ranking.")
item(s, 0.6, 4.35, "02", "Ranked by coverage", "Observed coverage of the backlog; first-eligible is the baseline.")
item(s, 0.6, 5.5, "03", "Audited decisions", "Every approval or rejection, and who made it, is recorded.")
card(s, 7.2, 3.2, 5.5, 3.0, fill=WHITE, line=RULE)
text(s, 7.5, 3.4, 5.0, 0.4, "Recommendation card", size=15, bold=True, color=INK)
text(s, 7.5, 3.9, 4.9, 2.2,
     ["A ranked list of lawful overtime options, with the coverage each one adds.",
      "Approve, reject or let it expire. Nothing changes on the simulated floor until it is approved, unless a room has enabled the audited auto-approve policy."],
     size=13, color=BODY, space_after=8)

# 15. Issue Pareto --------------------------------------------------------------------
s = new_slide("plain", notes=(
    "The Pareto answers the supervisor's first question: which few problems cost us most of the time. The bars are "
    "September 2026 issues: 1,280, 1,059 and 665, out of 3,004. It describes recorded work; it does not rank people or "
    "claim causation."))
header(s, "Issue Pareto", "Where the downtime comes from",
       "Issue class → observed symptom → applied fix, or floor → station")
shot(s, "screen-pareto.png", 0.6, 2.0, 8.2, "Issue Pareto")
for title, body, y in [
    ("Three measures", "Issues, downtime or failed attempts, by day, week or month.", 2.0),
    ("The vital few", "Sorted bars, cumulative line and an 80% marker.", 3.18),
    ("Drill down", "Class to symptom to the fix that was applied.", 4.36),
    ("Public records only", "Hidden causes are never used.", 5.54),
]:
    card(s, 9.1, y, 3.6, 1.04, fill=WHITE, line=RULE)
    text(s, 9.35, y + 0.14, 3.1, 0.35, title, size=14, bold=True, color=INK)
    text(s, 9.35, y + 0.46, 3.1, 0.6, body, size=12, color=BODY)

# 16. Results (Nebius) ----------------------------------------------------------------
s = new_slide("plain", notes=(
    "The month is synthetic and was generated offline with the app's own engine and deterministic fallbacks, so it is "
    "not a benchmark of the models. The 25% is the full-history reopen rate on the Analytics screen, over 4,682 repair "
    "attempts; it is not a September figure. The 78% is September: the top two classes account for 2,339 of 3,004 issues."))
header(s, "Results", "A month of operations",
       "Synthetic plant e8-aura-p1, simulated 1 September to 6 October 2026.")
metric(s, 0.6, 1.95, 3.83, 1.9, "3,004", "issues in September, the three Pareto classes combined", accent=True)
metric(s, 4.74, 1.95, 3.83, 1.9, "25%", "of 4,682 repair attempts reopened, full history on the Analytics screen")
metric(s, 8.87, 1.95, 3.83, 1.9, "78%", "of September issues in the top two classes (2,339 of 3,004)")
card(s, 0.6, 4.1, 12.1, 2.5, fill=WHITE, line=RULE)
text(s, 0.9, 4.3, 11.5, 0.4, "How it was made", size=16, bold=True, color=INK)
text(s, 0.9, 4.8, 11.5, 1.7,
     ["Generated offline with the app's own engine, with deterministic fallbacks. Every record is one the app would produce.",
      "A simulation, not a benchmark of Nemotron against a baseline. The 80% line is crossed on the third class. Weeks start Monday 08:00 UTC."],
     size=13, color=BODY, space_after=6)

# 17. Inference (Nebius) --------------------------------------------------------------
s = new_slide("plain", notes=(
    "Each role picks its own model in Settings, and the model name appears next to the calls it makes. Prices are the "
    "Token Factory list prices as recorded on 2026-10-19, in US dollars per million tokens. Ask Compass uses the Super "
    "assistant role."))
header(s, "Inference", "Built on Nebius Token Factory",
       "NVIDIA Nemotron models, one per role. Each role picks its own model in Settings. Prices as of 2026-10-19.")
table(s, 0.6, 2.0, 8.0, [
    ["Role", "Model", "$ in / out per 1M", "Context"],
    ["Investigator (tool loop)", "Nemotron 3 Ultra 550B-A55B", "1.00 / 3.00", "1,048,576"],
    ["Ranking and Ask Compass", "Nemotron 3 Super 120B-A12B", "0.30 / 0.90", "262,144"],
    ["Event planner and narrator", "Nemotron 3.5 Lightning", "0.06 / 0.24", "1,048,576"],
], [2.6, 2.7, 1.5, 1.2], row_h=0.55, size=12)
for n, (title, body, y) in enumerate([
    ("Validators are the contract", "Structured JSON, checked by code before anything is used.", 4.5),
    ("Bounded failure", "Timeouts, bounded retries and a circuit breaker per provider.", 5.25),
    ("Never holds the clock", "Model calls run in a background lane, not the simulation clock.", 6.0),
]):
    item(s, 0.6, y, f"0{n + 1}", title, body, width=7.2)
card(s, 9.0, 2.0, 3.7, 2.6, fill=INDIGO, line=INDIGO)
text(s, 9.3, 2.2, 3.2, 0.5, "Fallback on every call", size=16, bold=True, color=WHITE)
text(s, 9.3, 2.75, 3.2, 1.8,
     "If a model is slow, rate-limited or invalid, a deterministic path answers. Dispatch never stops on a model call.",
     size=13, color=INDIGO_INK)

# 18. Guest access (new) --------------------------------------------------------------
s = new_slide("plain", notes=(
    "Judges sign in with a valid username and the shared guest password. Each username gets its own workplace, copied "
    "from the full plant-1 history. New usernames close after ten registered workplaces, to limit bot sign-ups. "
    "Field reports and the Investigator are open to guest workplaces, paid from the sponsor's Nebius tokens."))
header(s, "Try it", "Guest workplaces",
       "Sign in with a valid username and the shared guest password. Each username gets its own workplace.")
for n, (title, body) in enumerate([
    ("Own workplace", "Each username starts from a full copy of the plant-1 history. Changes stay in that workplace."),
    ("Ten registered usernames", "New usernames close after ten workplaces, to limit bot sign-ups. Registered users still sign in."),
    ("Idle workplaces are swept", "A workplace unused for seven days is removed and its slot is freed."),
]):
    x = 0.6 + n * 4.1
    card(s, x, 2.0, 3.8, 2.4, fill=WHITE, line=RULE)
    text(s, x + 0.3, 2.25, 3.2, 0.5, title, size=16, bold=True, color=INK)
    text(s, x + 0.3, 2.85, 3.2, 1.5, body, size=13, color=BODY)
card(s, 0.6, 4.75, 12.1, 1.2, fill=WHITE, line=RULE)
text(s, 0.9, 4.95, 11.5, 0.4, "The Investigator is open to judges", size=14, bold=True, color=INK)
text(s, 0.9, 5.35, 11.5, 0.5,
     "Field reports and the Investigator run on guest workplaces with the sponsor's Nebius tokens. Ask Compass stays closed.",
     size=13, color=BODY)

# 19. Engineering ---------------------------------------------------------------------
s = new_slide("plain", notes=(
    "Everything that matters is tested without spending API credits. The browser tests force provider failures to prove "
    "the fallbacks. The hermetic suite passed 635 of 635 on 2026-10-26; the Chromium count is the last recorded run."))
header(s, "Built to run", "Engineering quality")
metric(s, 0.6, 1.75, 2.85, 1.75, "635", "hermetic unit and integration tests, all passing", accent=True)
metric(s, 3.7, 1.75, 2.85, 1.75, "208", "Chromium end-to-end tests, last recorded run")
for n, (title, body, y) in enumerate([
    ("One app, two modes", "Offline makes no API calls and is fully reproducible.", 3.85),
    ("Crash-safe state", "Checksummed journal and a restart-safe scheduler.", 4.8),
    ("Spend only when watched", "An unattended room pauses after 10 idle minutes by default; a usage ledger shows estimated spend.", 5.75),
]):
    item(s, 0.6, y, f"0{n + 1}", title, body, width=5.6)
shot(s, "01-console.png", 7.1, 2.0, 5.6, "Operator console")

# 20. Roadmap and open items ----------------------------------------------------------
s = new_slide("plain", notes=(
    "Review item: the amber card lists what must be finished before filing. Remove it from the final deck."))
header(s, "Roadmap", "What's next")
for n, (title, body, y) in enumerate([
    ("Real systems", "Maintenance, ticketing and rostering in place of the simulated floor.", 2.0),
    ("Learn from approvals", "Feed operator decisions and outcomes back into the evidence.", 3.15),
    ("Longer live measurement", "The Investigator against its baselines on live Nemotron runs.", 4.3),
]):
    item(s, 0.6, y, f"0{n + 1}", title, body, width=5.4)
card(s, 7.0, 2.0, 5.7, 4.3, fill=AMBER_FILL, line=AMBER, dashed=True)
text(s, 7.3, 2.2, 5.1, 0.4, "Open before submission (remove before filing)", size=14, bold=True, color=AMBER_INK)
text(s, 7.3, 2.8, 5.1, 3.4,
     ["Captured Investigator run on the deployment, to replace the placeholder on slide 8.",
      "Owner decision: whether judges can use field reports and the Investigator, and for how long.",
      "Demo video, under three minutes, uploaded to YouTube and linked on the form.",
      "Public repository under Apache-2.0, with a sanitized history scan, and a working URL with test credentials."],
     size=13, color=AMBER_INK, space_after=8)

# 21. Closing -------------------------------------------------------------------------
s = new_slide("art", notes=(
    "ResponseCompass: the right responder, the right fix, supervised by your control room. Built on Nemotron models "
    "through Nebius Token Factory. Repository and demo video links are added at filing."))
text(s, 0.6, 2.4, 7.5, 1.4, ["The right responder.", "The right fix."], size=40, bold=True, color=INDIGO)
text(s, 0.6, 3.9, 7.0, 1.0, "Runs autonomously. Supervised by your control room.", size=20, bold=True, color=INK)
text(s, 0.6, 4.7, 7.5, 1.4, ["Built on Nebius Token Factory with NVIDIA Nemotron models.",
                             "Apache-2.0 · synthetic data only · repository and demo video links added at filing"],
     size=14, color=BODY, space_after=4)

prs.save(OUT)
print("wrote", OUT, "slides:", len(prs.slides))
