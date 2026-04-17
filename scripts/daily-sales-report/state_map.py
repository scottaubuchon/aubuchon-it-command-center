"""
State SVG map data — 11 states (ME NH VT MA RI CT NY NJ PA MD VA).
Path geometry is static; fill color + tooltip + label vsP% are filled in per run.
"""

# Order = draw order in mockup. Each dict holds:
#   code, name, d (SVG path), label_xy (text anchor), pct_xy (pct label anchor),
#   label_fill (color for state abbr text), pct_fill (color for pct text)
STATES = [
    {"code": "ME", "name": "Maine",
     "d": "M374.0,149.0 L371.4,145.5 L362.5,140.1 L361.4,109.1 L358.5,78.8 L382.4,64.2 L370.3,41.4 L426.3,10.8 L480.2,23.1 L479.4,67.1 L492.0,101.2 L458.0,116.1 L438.1,109.8 L426.7,124.0 L394.2,130.0 L374.0,149.0Z",
     "label_xy": (431, 72), "pct_xy": (431, 83),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    {"code": "NH", "name": "New Hampshire",
     "d": "M358.5,78.8 L323.4,78.8 L323.4,133.5 L338.2,148.0 L343.0,149.9 L350.7,161.3 L362.5,155.9 L362.5,140.1 L361.4,109.1 L358.5,78.8Z",
     "label_xy": (341, 117), "pct_xy": (341, 128),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    {"code": "VT", "name": "Vermont",
     "d": "M323.4,78.8 L275.1,88.3 L273.6,94.9 L277.7,113.9 L273.6,133.5 L307.6,160.4 L323.4,133.5 L323.4,78.8Z",
     "label_xy": (299, 113), "pct_xy": (299, 124),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    {"code": "MA", "name": "Massachusetts",
     "d": "M400.9,181.3 L388.0,187.3 L374.3,192.0 L343.0,192.0 L347.4,190.4 L331.9,183.2 L294.7,182.5 L269.6,181.9 L277.7,160.1 L307.6,160.4 L323.4,133.5 L338.2,148.0 L343.0,149.9 L350.7,161.3 L362.5,155.9 L374.0,164.5 L400.9,181.3Z",
     "label_xy": (336, 166), "pct_xy": (336, 177),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    # RI uses external label with a line; rendered separately
    {"code": "RI", "name": "Rhode Island",
     "d": "M347.4,190.4 L343.0,192.0 L331.9,183.2 L331.9,205.0 L347.4,205.0 L347.4,190.4Z",
     "label_xy": None, "pct_xy": None,
     "label_fill": None, "pct_fill": None, "external_label": True},
    {"code": "CT", "name": "Connecticut",
     "d": "M267.4,205.9 L294.7,182.5 L331.9,183.2 L331.9,205.0 L284.7,216.7 L267.4,205.9Z",
     "label_xy": (302, 193), "pct_xy": (302, 204),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    {"code": "NY", "name": "New York",
     "d": "M267.4,205.9 L269.6,181.9 L277.7,160.1 L275.1,88.3 L323.4,78.8 L358.5,78.8 L374.0,149.0 L343.0,149.9 L338.2,148.0 L323.4,133.5 L307.6,160.4 L269.6,181.9 L254.8,221.4 L225.0,203.7 L201.0,183.5 L69.7,180.9 L56.1,166.1 L38.4,137.6 L143.5,88.3 L275.1,88.3 L273.6,94.9 L277.7,113.9 L273.6,133.5 L267.4,205.9Z",
     "label_xy": (172, 154), "pct_xy": (172, 165),
     "label_fill": "#fff", "pct_fill": "#fff"},
    {"code": "NJ", "name": "New Jersey",
     "d": "M193.2,263.8 L193.2,227.4 L206.5,217.6 L225.0,203.7 L254.8,221.4 L250.0,244.5 L235.7,267.0 L193.2,263.8Z",
     "label_xy": (228, 236), "pct_xy": (228, 247),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    {"code": "PA", "name": "Pennsylvania",
     "d": "M10.3,173.0 L38.4,166.1 L56.1,166.1 L69.7,180.9 L201.0,183.5 L206.5,217.6 L193.2,227.4 L193.2,255.6 L48.7,255.6 L10.3,226.5 L10.3,173.0Z",
     "label_xy": (112, 211), "pct_xy": (112, 222),
     "label_fill": "#1f2937", "pct_fill": "#1f2937"},
    {"code": "MD", "name": "Maryland",
     "d": "M184.8,295.4 L184.8,255.6 L48.7,255.6 L48.7,271.7 L96.6,279.3 L135.7,280.3 L141.6,295.8 L157.5,306.8 L176.3,309.1 L184.8,295.4Z",
     "label_xy": (118, 268), "pct_xy": None,
     "label_fill": "#1f2937", "pct_fill": None, "combined_label": True},  # shows "MD +X.X%" in one line at label_xy
    {"code": "VA", "name": "Virginia (Alexandria)",
     "d": "M122.8,282.2 L135.7,280.3 L139.0,285.3 L128.0,287.2 L122.8,282.2Z",
     "label_xy": None, "pct_xy": None,
     "label_fill": None, "pct_fill": None, "no_label": True},  # too small for inline label
]

# Full state name → 2-letter code
STATE_NAME_TO_CODE = {s["name"]: s["code"] for s in STATES}
# Handle Virginia variations
STATE_NAME_TO_CODE["Virginia"] = "VA"


# ColorBrewer RdYlGn diverging palette (reversed so red=low, green=high).
# Anchors are spaced in *data space* — pct vs plan — so the interpolation
# matches the legend gradient stops and produces the classic climate-style
# heat-map look: deep red for large misses, pale yellow near plan, deep
# green for strong beats.
_COLOR_STOPS = (
    (-35.0, (0xa5, 0x00, 0x26)),   # deep red
    (-25.0, (0xd7, 0x30, 0x27)),   # red
    (-15.0, (0xf4, 0x6d, 0x43)),   # red-orange
    ( -7.0, (0xfd, 0xae, 0x61)),   # orange
    (  0.0, (0xff, 0xff, 0xbf)),   # pale yellow (neutral)
    (  7.0, (0xd9, 0xef, 0x8b)),   # yellow-green
    ( 15.0, (0xa6, 0xd9, 0x6a)),   # light green
    ( 25.0, (0x1a, 0x98, 0x50)),   # deep green
)

# Gradient stop info exported for the legend (offsets match data space for
# the range −35% → +25%, i.e. 60 pct-points total).
LEGEND_STOPS = [
    (0.00,    "#a50026"),   # -35%
    (0.1667,  "#d73027"),   # -25%
    (0.3333,  "#f46d43"),   # -15%
    (0.4667,  "#fdae61"),   #  -7%
    (0.5833,  "#ffffbf"),   #   0%
    (0.7000,  "#d9ef8b"),   #  +7%
    (0.8333,  "#a6d96a"),   # +15%
    (1.00,    "#1a9850"),   # +25%
]
LEGEND_MIN = -35.0
LEGEND_MAX = 25.0


def color_for_pct(pct_vs_plan):
    """Heat-map gradient for sales vs plan.

    Green = positive (beating plan), red = negative (under plan),
    pale yellow ≈ 0% (on plan). Smoothly interpolates between
    ColorBrewer RdYlGn anchor stops.
    """
    p = max(_COLOR_STOPS[0][0], min(_COLOR_STOPS[-1][0], pct_vs_plan))
    for i in range(len(_COLOR_STOPS) - 1):
        a_p, a_rgb = _COLOR_STOPS[i]
        b_p, b_rgb = _COLOR_STOPS[i + 1]
        if a_p <= p <= b_p:
            t = 0.0 if b_p == a_p else (p - a_p) / (b_p - a_p)
            r = int(round(a_rgb[0] + (b_rgb[0] - a_rgb[0]) * t))
            g = int(round(a_rgb[1] + (b_rgb[1] - a_rgb[1]) * t))
            b = int(round(a_rgb[2] + (b_rgb[2] - a_rgb[2]) * t))
            return f"#{r:02x}{g:02x}{b:02x}"
    r, g, b = _COLOR_STOPS[-1][1]
    return f"#{r:02x}{g:02x}{b:02x}"


def text_fill_for_pct(pct_vs_plan):
    """Pick label text color that stays legible on the heat-map fill.

    Dark text over mid/light fills, white text over the deepest reds and
    greens at the ends of the scale.
    """
    if pct_vs_plan is None:
        return "#1f2937"
    if pct_vs_plan <= -22 or pct_vs_plan >= 20:
        return "#ffffff"
    return "#1f2937"
