using ACadSharp;
using ACadSharp.Entities;

static class CadInspection {
    public static object Summarize(CadDocument doc){
        var entities=doc.BlockRecords.SelectMany(b=>b.Entities).ToArray();
        return new {
            layerInventory=doc.Layers.Select(l=>new{name=l.Name,on=l.IsOn,frozen=(l.Flags&ACadSharp.Tables.LayerFlags.Frozen)!=0,newViewportFrozen=(l.Flags&ACadSharp.Tables.LayerFlags.FrozenNewViewports)!=0,flags=l.Flags.ToString(),modelEntities=doc.Entities.Count(e=>e.Layer?.Name==l.Name),definitionEntities=entities.Count(e=>e.Layer?.Name==l.Name),invisibleEntities=entities.Count(e=>e.Layer?.Name==l.Name&&e.IsInvisible)}),
            layouts=doc.Layouts?.Select(l=>new{name=l.Name,paperSpace=l.IsPaperSpace,entities=l.AssociatedBlock?.Entities.Count??0}),
            blocks=doc.BlockRecords.Select(b=>new{name=b.Name,flags=b.Flags.ToString(),entities=b.Entities.Count}),
            types=entities.GroupBy(e=>e.GetType().Name).ToDictionary(g=>g.Key,g=>g.Count()),
            hatchFlags=entities.OfType<Hatch>().GroupBy(h=>new{h.IsSolid,h.IsDouble,gradient=h.GradientColor?.Enabled}).Select(g=>new{g.Key,count=g.Count(),edges=g.SelectMany(h=>h.Paths).SelectMany(p=>p.Edges).GroupBy(e=>e.ToEntity().GetType().Name).ToDictionary(x=>x.Key,x=>x.Count())}),
            dimensions=entities.OfType<Dimension>().GroupBy(d=>new{type=d.GetType().Name,hasBlock=d.Block!=null}).Select(g=>new{g.Key,count=g.Count(),children=g.First().Block?.Entities.GroupBy(e=>e.GetType().Name).ToDictionary(x=>x.Key,x=>x.Count())}),
            hatches=entities.OfType<Hatch>().GroupBy(h=>new{h.IsSolid,pattern=h.Pattern?.Name,style=h.Style.ToString()}).Select(g=>new{g.Key,count=g.Count(),edges=g.SelectMany(h=>h.Paths).SelectMany(p=>p.Edges).GroupBy(e=>e.GetType().Name).ToDictionary(x=>x.Key,x=>x.Count()),sample=g.Take(2).Select(h=>new{h.PatternAngle,h.PatternScale,paths=h.Paths.Count,lines=h.Pattern?.Lines.Select(l=>new{l.Angle,basePoint=new[]{l.BasePoint.X,l.BasePoint.Y},offset=new[]{l.Offset.X,l.Offset.Y},dashes=l.DashLengths})})})
        };
    }
}
