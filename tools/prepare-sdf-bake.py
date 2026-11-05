"""Preserve every SDF byte while bounding per-glyph spatial lookup storage."""
import argparse,hashlib,re
from pathlib import Path

UPSTREAM='0e77cae652271d08c7619238e619f9b6668ae17c'
NAME='src/scene/text/sdf_atlas.rs'
SHA256='8d5885f9f4c3c240ed828fdc5bed94d01f2c99582fce88562f9af0ac7c6e7355'

def helper():
    return Path(__file__).with_name('glyph-sdf-index.rs').read_text(encoding='utf-8')

def once(text,before,after):
    assert text.count(before)==1,'Pinned SDF baking anchor changed'
    return text.replace(before,after,1)

def transform(text):
    text=once(text,'    let mut data = vec![0u8; (w * h) as usize];\n    let inv = 1.0 / PX_PER_UNIT;',
        '    let spatial = GlyphSdfIndex::new(g, w, h, plane_min, plane_max, pen_half, filled);\n'
        '    let mut data = vec![0u8; (w * h) as usize];\n    let inv = 1.0 / PX_PER_UNIT;')
    text=once(text,'            let d = min_dist_to_strokes(gx, gy, &g.strokes);',
        '            let d = spatial.as_ref().map_or_else(\n'
        '                || min_dist_to_strokes(gx, gy, &g.strokes),\n'
        '                |index| index.distance(g, px, py, gx, gy),\n'
        '            );')
    text=once(text,'                if point_in_fill(gx, gy, &g.fill_tris) {',
        '                if spatial.as_ref().map_or_else(\n'
        '                    || point_in_fill(gx, gy, &g.fill_tris),\n'
        '                    |index| index.contains(g, px, py, gx, gy),\n'
        '                ) {')
    return once(text,'/// Minimum distance from `(x, y)` to any segment of any polyline.',
        helper()+'\n/// Minimum distance from `(x, y)` to any segment of any polyline.')

HARNESS=r'''
use std::cell::Cell;
thread_local! { static FILL: Cell<bool> = const { Cell::new(true) }; }
fn textfill() -> bool { FILL.with(Cell::get) }
#[derive(Clone)]
struct Glyph { strokes: Vec<Vec<[f32;2]>>, fill_tris: Vec<[f32;2]>, advance: f32 }
__TILE__
__CONSTANTS__
mod original { use super::*; __ORIGINAL__ }
mod candidate { use super::*; __CANDIDATE__
 pub(super) fn references(g: &Glyph, tile: &BakedTile, filled: bool) -> Option<(usize,usize)> {
  let index=GlyphSdfIndex::new(g,tile.w,tile.h,tile.plane_min,tile.plane_max,0.35,filled)?;
  Some((index.edge_grid.references.len(),index.fill_grid.as_ref().map_or(0,|g|g.references.len())))
 }
}
fn compare(name:&str,g:&Glyph) {
 for fill in [false,true] { FILL.with(|f|f.set(fill)); for pen in [0.35f32,0.595] {
  match (original::bake_glyph(g,pen),candidate::bake_glyph(g,pen)) {
   (None,None)=>{},
   (Some(a),Some(b))=>{
    assert_eq!((a.w,a.h),(b.w,b.h),"{name} dimensions");
    assert_eq!(a.plane_min.map(f32::to_bits),b.plane_min.map(f32::to_bits),"{name} minimum");
    assert_eq!(a.plane_max.map(f32::to_bits),b.plane_max.map(f32::to_bits),"{name} maximum");
    assert_eq!(a.advance.to_bits(),b.advance.to_bits(),"{name} advance");
    assert_eq!(a.pen.to_bits(),b.pen.to_bits(),"{name} pen");
    if a.data!=b.data {let n=a.data.iter().zip(&b.data).position(|(a,b)|a!=b).unwrap();panic!("{name} fill={fill} pen={pen} pixel=({},{}): {} != {}",n%a.w as usize,n/a.w as usize,a.data[n],b.data[n]);}
   },_=>panic!("{name} ink presence changed"),
  }
 }}
}
fn dense() -> Glyph {
 let mut g=Glyph{strokes:Vec::new(),fill_tris:Vec::new(),advance:10.0};
 for ring in 0..9 {
  let cx=(ring%3) as f32*3.0;let cy=(ring/3) as f32*3.0;
  let mut stroke=Vec::new();
  for n in 0..=64 {let a=n as f32*std::f32::consts::TAU/64.0;stroke.push([cx+a.cos(),cy+a.sin()]);}
  for edge in stroke.windows(2) {g.fill_tris.extend([[cx,cy],edge[0],edge[1]]);}
  g.strokes.push(stroke);
 }
 g
}
#[test] fn empty_points_and_outlines() {
 compare("empty",&Glyph{strokes:vec![],fill_tris:vec![],advance:1.0});
 compare("points",&Glyph{strokes:(0..40).map(|n|vec![(n as f32/8.0).sin_cos().into()]).collect(),fill_tris:vec![],advance:6.0});
 compare("dense real-shape-like contours",&dense());
}
#[test] fn deterministic_random_and_thin_geometry() {
 let mut state=0x37c8_4291u32;
 let mut next=||{state=state.wrapping_mul(1664525).wrapping_add(1013904223);((state>>16) as f32/65535.0-0.5)*18.0};
 for case in 0..24 {
  let mut g=Glyph{strokes:vec![],fill_tris:vec![],advance:10.0};
  for stroke in 0..3 {g.strokes.push((0..(20+case%17)).map(|_|[next(),if stroke==2{next()*0.00001}else{next()}]).collect());}
  for _ in 0..(20+case) {g.fill_tris.extend((0..3).map(|_|[next(),next()]));}
  if case%3==0 {g.fill_tris.extend([[1.0,1.0];3]);}
  compare(&format!("seeded {case}"),&g);
 }
}
#[test] fn extreme_and_degenerate_fallbacks() {
 let mut g=dense();g.fill_tris.extend([[4.0,4.0];3]);compare("point triangle inclusive behaviour",&g);
 g.fill_tris.extend([[0.0,0.0],[8.0,0.0000001],[16.0,0.0000002]]);compare("near collinear",&g);
 g.strokes[0][0]=[1000.0,1000.0];compare("extreme capped tile",&g);
 let mut tiny=dense();for p in tiny.strokes.iter_mut().flatten().chain(tiny.fill_tris.iter_mut()){p[0]*=1e-12;p[1]*=1e-12;}compare("underflow scale",&tiny);
}
#[test] fn bounded_tables_and_original_fallback() {
 let g=dense();FILL.with(|f|f.set(true));let tile=original::bake_glyph(&g,0.35).unwrap();
 let references=candidate::references(&g,&tile,true).expect("dense glyph should use the exact bounded index");
 assert!(references.0<=131072&&references.1<=131072);
 assert!(references.0<g.strokes.iter().map(|s|s.len()-1).sum::<usize>()*((tile.w as usize+7)/8)*((tile.h as usize+7)/8));
 let over=Glyph{strokes:vec![vec![[0.0,0.0]];16385],fill_tris:vec![],advance:1.0};compare("primitive limit",&over);
 let tile=original::bake_glyph(&over,0.35).unwrap();assert!(candidate::references(&over,&tile,false).is_none());
 let mut associations=Glyph{strokes:vec![vec![[-5.0,-5.0],[5.0,5.0]]],fill_tris:vec![[1.0,1.0];15000],advance:11.0};
 compare("reference limit",&associations);let tile=original::bake_glyph(&associations,0.35).unwrap();assert!(candidate::references(&associations,&tile,true).is_none());
 associations.strokes.clear();compare("fill without outlines",&associations);
}
#[test] fn dense_glyph_timing_with_identical_bytes() {
 let g=dense();FILL.with(|f|f.set(true));compare("timed",&g);
 let before=std::time::Instant::now();for _ in 0..4{std::hint::black_box(original::bake_glyph(std::hint::black_box(&g),0.35));}let old=before.elapsed();
 let before=std::time::Instant::now();for _ in 0..4{std::hint::black_box(candidate::bake_glyph(std::hint::black_box(&g),0.35));}let new=before.elapsed();
 println!("SDF_EXACT_BENCH original_us={} indexed_us={} (timing evidence only; not a phone benchmark)",old.as_micros(),new.as_micros());
}
'''

def make_harness(original):
    tile=re.search(r'struct BakedTile \{.*?\n\}',original,re.S).group()
    constants='\n'.join(re.search(r'const '+name+r': .*?;',original).group() for name in ('PX_PER_UNIT','SPREAD_UNITS','MAX_TILE_PX'))
    def baking(text):
        value=text.split('fn bake_glyph(',1)[1].split('// ── Tests',1)[0]
        return 'pub(super) fn bake_glyph('+value
    result=HARNESS.replace('__TILE__',tile).replace('__CONSTANTS__',constants).replace('__ORIGINAL__',baking(original)).replace('__CANDIDATE__',baking(transform(original)))
    # Rust tuple-to-array conversion is not assumed by the standalone adapter.
    result=result.replace('(n as f32/8.0).sin_cos().into()','{let (x,y)=(n as f32/8.0).sin_cos();[x,y]}')
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('--harness',required=True,type=Path);args=parser.parse_args()
    target=args.source/NAME;raw=target.read_bytes();assert hashlib.sha256(raw).hexdigest()==SHA256
    original=raw.decode('utf-8');result=transform(original)
    assert result!=original
    target.write_text(result,encoding='utf-8',newline='\n')
    args.harness.write_text(make_harness(original),encoding='utf-8',newline='\n')
    print('Applied bounded exact glyph spatial indexing; original scan and all raster parameters retained')

if __name__=='__main__':main()
