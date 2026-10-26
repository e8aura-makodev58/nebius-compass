"""Draft Nebius deck for ResponseCompass, built with python-pptx (MIT).

Diagrams use connectors glued to their shapes (begin_connect / end_connect), so moving a box in
PowerPoint keeps its arrows attached. Run: python3 docs/nebius/deck/build_deck.py
Screenshots are live captures from the deployed app, kept in ./assets.
"""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ASSETS = HERE / "assets"
LOGO = REPO / "frontend/icons/Compass_application_logo_icon_20261025201828.jpg"
OUT = HERE / "ResponseCompass-nebius-deck-draft.pptx"

NAVY = RGBColor(0x0F, 0x2B, 0x43)
LIME = RGBColor(0xE1, 0xFE, 0x3C)
PAPER = RGBColor(0xEE, 0xF2, 0xF7)
MUTED = RGBColor(0x5B, 0x6B, 0x7A)
AMBER = RGBColor(0xB4, 0x53, 0x09)
AMBER_WASH = RGBColor(0xFF, 0xF7, 0xE6)
RULE = RGBColor(0xC9, 0xD3, 0xDD)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
FONT = "Arial"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


def style_run(run, size, bold=False, color=NAVY):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return run


def set_bullet(paragraph, level_indent=0.28):
    pPr = paragraph._p.get_or_add_pPr()
    pPr.set("marL", str(int(Inches(level_indent))))
    pPr.set("indent", str(-int(Inches(level_indent))))
    for tag in ("a:buNone", "a:buChar", "a:buAutoNum"):
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    bu = pPr.makeelement(qn("a:buChar"), {"char": "•"})
    pPr.append(bu)


def text(slide, x, y, w, h, lines, size=18, bold=False, color=NAVY, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, bullets=False, space_after=8):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05)
    if isinstance(lines, str):
        lines = [lines]
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        run = style_run(p.add_run(), size, bold, color)
        run.text = line
        if bullets:
            set_bullet(p)
    return box


def box(slide, x, y, w, h, lines, fill=PAPER, line=RULE, size=14, bold_first=False,
        color=NAVY, anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER, dashed=False, shape=MSO_SHAPE.RECTANGLE):
    shp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.shadow.inherit = False
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    shp.line.color.rgb = line
    shp.line.width = Pt(1.25)
    if dashed:
        shp.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    tf = shp.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.12)
    tf.margin_top = tf.margin_bottom = Inches(0.08)
    if isinstance(lines, str):
        lines = [lines]
    for i, line_text in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(4)
        first = bold_first and i == 0
        style_run(p.add_run(), size + (2 if first else 0), first, color).text = line_text
    return shp


def arrow(slide, a, b, begin_idx=3, end_idx=1, color=NAVY, dashed=False):
    """Straight connector glued to a and b. Rectangle sites: 0 top, 1 left, 2 bottom, 3 right."""
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, 0, 0, Inches(1), Inches(1))
    c.begin_connect(a, begin_idx)
    c.end_connect(b, end_idx)
    c.line.color.rgb = color
    c.line.width = Pt(1.75)
    if dashed:
        c.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    ln = c.line._get_or_add_ln()
    ln.append(ln.makeelement(qn("a:tailEnd"), {"type": "triangle", "w": "med", "len": "med"}))
    return c


def frame(title, kicker):
    s = prs.slides.add_slide(BLANK)
    bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Inches(0.12))
    bar.fill.solid()
    bar.fill.fore_color.rgb = LIME
    bar.line.fill.background()
    text(s, 0.6, 0.35, 12, 0.3, kicker.upper(), size=11, bold=True, color=MUTED)
    text(s, 0.6, 0.62, 12.1, 0.9, title, size=28, bold=True, color=NAVY)
    text(s, 0.6, 7.05, 6, 0.3, "ResponseCompass · draft for review", size=9, color=MUTED)
    return s


def screenshot_slide(title, kicker, image, caption_lines):
    s = frame(title, kicker)
    s.shapes.add_picture(str(ASSETS / image), Inches(0.6), Inches(1.6), width=Inches(9.25))
    text(s, 10.1, 1.7, 2.7, 5.0, caption_lines, size=14, bullets=True, space_after=12)
    return s


# 1 Cover
s = prs.slides.add_slide(BLANK)
s.shapes.add_picture(str(LOGO), Inches(0.6), Inches(0.9), width=Inches(6.4))
text(s, 7.4, 2.2, 5.4, 1.6, "Context-aware responder dispatch for operations control rooms", size=24, bold=True)
text(s, 7.4, 3.9, 5.4, 1.2,
     "An agent that recommends who to send and what to try first, cited from past repairs. People approve every dispatch.",
     size=15, color=MUTED)
text(s, 0.6, 6.6, 12, 0.4, "Nebius x NVIDIA Global AI Hackathon · Best Apps and Agents", size=12, color=MUTED)

# 2 Problem
s = frame("The closest technician is not always the best one to send", "The problem")
text(s, 0.6, 1.7, 12, 4.5, [
    "Equipment faults arrive as technician reports in plain language, not clean tickets.",
    "The nearest responder often has no record on this fault.",
    "The first fix tried is often a guess, and each failed attempt costs downtime.",
    "What works lives in old tickets and in people's heads, so it is hard to reuse.",
], size=20, bullets=True, space_after=14)

# 3 Demo story: one connected row of six beats
s = frame("One report, from words to an approved dispatch", "The demo story")
beats = [
    "1  Free-text field report arrives",
    "2  Wall screens show the room",
    "3  Code resolves equipment and options",
    "4  Nemotron investigates with cited cases",
    "5  Operator confirms and approves",
    "6  Outcome, history and analytics",
]
w, gap = 1.8, 0.26
shapes = [box(s, 0.6 + i * (w + gap), 2.4, w, 1.9, b, size=13, align=PP_ALIGN.LEFT,
              fill=LIME if i == 3 else PAPER) for i, b in enumerate(beats)]
for a, b in zip(shapes, shapes[1:]):
    arrow(s, a, b)
text(s, 0.6, 4.9, 12, 0.6, "Nothing is dispatched for a field report without an approval record.",
     size=16, bold=True)

# 4 Live Floor
screenshot_slide("The control room watches the floor and keeps the controls", "Live Floor",
                 "console-1600.png", [
                     "Six wall screens, one panel per monitor: floor map, issues, dispatch, event feed, Issue Pareto, analytics.",
                     "The operator console keeps override, pause and approval.",
                     "Live deployed app, synthetic plant data.",
                 ])

# 5 Investigator flow, connected
s = frame("A field report becomes a cited, approved recommendation", "Compass Investigator")
steps = [
    ("1  Report", "Operator types what happened. Text is untrusted data."),
    ("2  Options", "Code lists possible equipment and symptom pairs (at most 12)."),
    ("3  Investigate", "Nemotron 3 Ultra reads past cases with read-only tools and cites them."),
    ("4  Confirm", "Operator confirms the symptom and ticks safety prerequisites."),
    ("5  Approve", "Central command approves responder and fix. Audit record written."),
]
w, gap = 2.2, 0.27
boxes = [box(s, 0.6 + i * (w + gap), 1.9, w, 2.7, [t, d], size=13, bold_first=True,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, fill=LIME if i == 2 else PAPER)
         for i, (t, d) in enumerate(steps)]
for a, b in zip(boxes, boxes[1:]):
    arrow(s, a, b)
box(s, 0.6, 5.0, 12.1, 1.2, [
    "PLACEHOLDER: Investigator screenshots are not in this draft.",
    "Guest workplaces currently block field reports ('This action is unavailable in demo workplaces'), and live "
    "Nemotron calls need the Nebius key on the server. Both are open decisions.",
], fill=AMBER_WASH, line=AMBER, size=13, align=PP_ALIGN.LEFT)

# 6 Analytics
screenshot_slide("A month of recorded work shows where the time goes", "Analytics",
                 "analytics-tab.png", [
                     "September 2026: 3,004 issues in the synthetic plant.",
                     "Reopen rate 25% of 4,683 observed attempts.",
                     "The top two issue classes make 78% of September's issues; the 80% line is crossed on the third.",
                     "Compass recommendations are compared with their baselines; disagreements are recorded.",
                 ])

# 7 Pareto
screenshot_slide("Where the downtime comes from", "Issue Pareto",
                 "screen-pareto.png", [
                     "Bars, cumulative line and the 80% marker show which few classes cause most work.",
                     "Drill down from class to symptom to the fix that was applied.",
                     "The Pareto describes recorded work. It does not rank people or claim cause.",
                 ])

# 8 Honest by design: connected pipeline
s = frame("Code owns the facts. Models only rank and explain.", "Honest by design")
flow = [
    ("Code", "Eligibility, travel time and observed history"),
    ("Code", "Bounded list of options"),
    ("Model", "Ranks the options and explains each ranking"),
    ("Code", "Validates output, citations and safety rules"),
    ("Operator", "Approves; the dispatch gate opens only then"),
]
w, gap = 2.2, 0.27
nodes = [box(s, 0.6 + i * (w + gap), 1.9, w, 2.4, [who.upper(), what], size=13, bold_first=True,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             fill=LIME if who == "Model" else PAPER) for i, (who, what) in enumerate(flow)]
for a, b in zip(nodes, nodes[1:]):
    arrow(s, a, b)
box(s, 0.6, 4.9, 12.1, 1.3, [
    "Never shown to any model or screen",
    "Responder skill and the true fault cause are hidden simulation truth. Models see only public, observable "
    "records, and each citation is checked against what the tools actually returned.",
], fill=None, line=NAVY, size=13, align=PP_ALIGN.LEFT, dashed=True)

# 9 Models: table, then status callout beneath
s = frame("Built on NVIDIA Nemotron through Nebius Token Factory", "Models and infrastructure")
rows = [
    ("Role", "Model (code default)", "What it does"),
    ("Investigator", "Nemotron 3 Ultra (550B-A55B)", "Tool-using investigation of a field report, with cited cases"),
    ("Responder, fix and overtime ranking", "Nemotron 3 Super (120B-A12B)", "Ranks code-supplied options with qualitative rationale"),
    ("Event planner and narrator", "Nemotron 3.5 Lightning", "Plans simulated events and writes simulated narratives"),
]
table = s.shapes.add_table(len(rows), 3, Inches(0.6), Inches(1.7), Inches(12.1), Inches(2.2)).table
for c, width in enumerate([3.4, 3.8, 4.9]):
    table.columns[c].width = Inches(width)
for r, row in enumerate(rows):
    for c, value in enumerate(row):
        cell = table.cell(r, c)
        cell.text = value
        para = cell.text_frame.paragraphs[0]
        style_run(para.runs[0], 13, bold=(r == 0), color=WHITE if r == 0 else NAVY)
        cell.fill.solid()
        cell.fill.fore_color.rgb = NAVY if r == 0 else (PAPER if r % 2 == 0 else WHITE)
accent = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(4.75), Inches(0.08), Inches(0.9))
accent.fill.solid()
accent.fill.fore_color.rgb = AMBER
accent.line.fill.background()
text(s, 0.85, 4.75, 11.8, 0.9,
     "Status: live Nebius calls are pending the Token Factory key on the deployed server. Until it is set, every "
     "ranking uses the deterministic fallback, and the screens say so. These slides will be re-shot after a live probe.",
     size=13, anchor=MSO_ANCHOR.MIDDLE)
text(s, 0.6, 5.9, 12, 0.6, "Provider controls: per-provider timeouts, bounded retries, rate limiting and a circuit breaker.",
     size=14, bullets=True)

# 10 Status
s = frame("Status and what is left before submission", "Status")
text(s, 0.6, 1.7, 5.8, 0.5, "Built and tested", size=18, bold=True)
text(s, 0.6, 2.25, 5.8, 4.0, [
    "Control room wall screens and operator console",
    "Guest workplaces with a shared password and a cap of 10 registered users",
    "Dispatch gate, approval routes and audit trail",
    "635 hermetic tests and 208 Chromium end-to-end tests on master",
], size=16, bullets=True, space_after=12)
text(s, 6.9, 1.7, 5.8, 0.5, "Open before submission", size=18, bold=True, color=AMBER)
text(s, 6.9, 2.25, 5.8, 4.0, [
    "Nebius Token Factory key on the server, then a live Nemotron probe",
    "Decide whether judges can use field reports (Investigator) on guest workplaces",
    "Re-record the three-minute video with live Nemotron calls",
    "Upload the video to YouTube and publish the Apache-2.0 repository",
], size=16, bullets=True, space_after=12)

prs.save(OUT)
print("written", OUT)
