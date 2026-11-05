// SPDX-License-Identifier: GPL-3.0-only
// Exact SDF queries over bounded per-glyph spatial buckets. The original
// distance and triangle predicates remain the source of every emitted byte.
const GLYPH_SDF_CELL: usize = 8;
const GLYPH_SDF_MAX_PRIMITIVES: usize = 16_384;
const GLYPH_SDF_MAX_REFERENCES: usize = 131_072;

struct GlyphSdfGrid {
    cols: usize,
    offsets: Vec<u32>,
    references: Vec<u32>,
}

impl GlyphSdfGrid {
    fn build(cols: usize, rows: usize, ranges: Vec<[usize; 4]>) -> Option<Self> {
        let cells = cols.checked_mul(rows)?;
        let mut counts = vec![0u32; cells];
        let mut total = 0usize;
        for &[x0, y0, x1, y1] in &ranges {
            total = total.checked_add((x1 - x0 + 1).checked_mul(y1 - y0 + 1)?)?;
            if total > GLYPH_SDF_MAX_REFERENCES {
                return None;
            }
            for y in y0..=y1 {
                for x in x0..=x1 {
                    counts[y * cols + x] = counts[y * cols + x].checked_add(1)?;
                }
            }
        }
        let mut offsets = Vec::with_capacity(cells + 1);
        offsets.push(0u32);
        for count in counts {
            offsets.push(offsets.last().copied()?.checked_add(count)?);
        }
        let mut cursors = offsets[..cells].to_vec();
        let mut references = vec![0u32; total];
        // Preserve source primitive order inside every bucket.
        for (id, &[x0, y0, x1, y1]) in ranges.iter().enumerate() {
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let cell = y * cols + x;
                    references[cursors[cell] as usize] = id as u32;
                    cursors[cell] += 1;
                }
            }
        }
        Some(Self { cols, offsets, references })
    }

    fn at(&self, px: u32, py: u32) -> &[u32] {
        let cell = py as usize / GLYPH_SDF_CELL * self.cols
            + px as usize / GLYPH_SDF_CELL;
        &self.references[self.offsets[cell] as usize..self.offsets[cell + 1] as usize]
    }
}

struct GlyphSdfIndex {
    // A zero end index represents a one-point stroke; otherwise the segment
    // ends at that point and starts at end-1. No glyph geometry is copied.
    edges: Vec<(usize, usize)>,
    edge_grid: GlyphSdfGrid,
    fill_grid: Option<GlyphSdfGrid>,
}

impl GlyphSdfIndex {
    fn new(
        glyph: &Glyph,
        w: u32,
        h: u32,
        plane_min: [f32; 2],
        plane_max: [f32; 2],
        pen_half: f32,
        filled: bool,
    ) -> Option<Self> {
        // Unusual/extreme coordinates retain the original unbounded scan.
        // Normal font outlines occupy the existing nine-unit glyph space.
        if !pen_half.is_finite() || pen_half < 0.0
            || glyph.strokes.iter().flatten().chain(glyph.fill_tris.iter())
                .flatten().any(|v| !v.is_finite() || v.abs() > 64.0)
        {
            return None;
        }
        let mut edges = Vec::new();
        for (stroke, points) in glyph.strokes.iter().enumerate() {
            let first = if points.len() == 1 { 0 } else { 1 };
            for end in first..points.len() {
                if edges.len() == GLYPH_SDF_MAX_PRIMITIVES { return None; }
                edges.push((stroke, end));
            }
        }
        let triangles = glyph.fill_tris.len() / 3;
        if triangles > GLYPH_SDF_MAX_PRIMITIVES
            || (edges.len() < 16 && (!filled || triangles < 16))
        {
            return None;
        }
        let cols = (w as usize + GLYPH_SDF_CELL - 1) / GLYPH_SDF_CELL;
        let rows = (h as usize + GLYPH_SDF_CELL - 1) / GLYPH_SDF_CELL;
        let bucket = |v: f32, count: usize| {
            (v / GLYPH_SDF_CELL as f32).floor().max(0.0)
                .min((count - 1) as f32) as usize
        };
        let range = |lo: [f32; 2], hi: [f32; 2]| [
            bucket((lo[0] - plane_min[0]) * PX_PER_UNIT - 1.0, cols),
            bucket((plane_max[1] - hi[1]) * PX_PER_UNIT - 1.0, rows),
            bucket((hi[0] - plane_min[0]) * PX_PER_UNIT + 1.0, cols),
            bucket((plane_max[1] - lo[1]) * PX_PER_UNIT + 1.0, rows),
        ];
        // Beyond this distance the original final SDF byte is saturated.
        // Include an extra pixel and retain the original arithmetic within.
        let radius = SPREAD_UNITS + pen_half + 1.0 / PX_PER_UNIT;
        let edge_ranges = edges.iter().map(|&(stroke, end)| {
            let b = glyph.strokes[stroke][end];
            let a = glyph.strokes[stroke][end.saturating_sub(1)];
            range([a[0].min(b[0]) - radius, a[1].min(b[1]) - radius],
                  [a[0].max(b[0]) + radius, a[1].max(b[1]) + radius])
        }).collect();
        let edge_grid = GlyphSdfGrid::build(cols, rows, edge_ranges)?;
        let fill_grid = if filled {
            let fill_ranges = glyph.fill_tris.chunks_exact(3).map(|t| {
                // The original inclusive predicate has special behaviour for
                // degenerate/near-degenerate triangles. Never cull those.
                if edge_sign(t[0][0], t[0][1], t[1], t[2]).abs() < 0.001 {
                    return [0, 0, cols - 1, rows - 1];
                }
                range([t[0][0].min(t[1][0]).min(t[2][0]),
                       t[0][1].min(t[1][1]).min(t[2][1])],
                      [t[0][0].max(t[1][0]).max(t[2][0]),
                       t[0][1].max(t[1][1]).max(t[2][1])])
            }).collect();
            Some(GlyphSdfGrid::build(cols, rows, fill_ranges)?)
        } else { None };
        Some(Self { edges, edge_grid, fill_grid })
    }

    fn distance(&self, glyph: &Glyph, px: u32, py: u32, x: f32, y: f32) -> f32 {
        let mut best = f32::INFINITY;
        for &id in self.edge_grid.at(px, py) {
            let (stroke, end) = self.edges[id as usize];
            let points = &glyph.strokes[stroke];
            let d = if end == 0 {
                dist(x, y, points[0][0], points[0][1])
            } else {
                dist_point_seg(x, y, points[end - 1], points[end])
            };
            best = best.min(d);
        }
        best
    }

    fn contains(&self, glyph: &Glyph, px: u32, py: u32, x: f32, y: f32) -> bool {
        self.fill_grid.as_ref().is_some_and(|grid| grid.at(px, py).iter().any(|&id| {
            let t = &glyph.fill_tris[id as usize * 3..id as usize * 3 + 3];
            point_in_tri(x, y, t[0], t[1], t[2])
        }))
    }
}
