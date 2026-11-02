using ACadSharp;
using ACadSharp.IO;
using ACadSharp.Entities;
using ACadSharp.Tables;
using CSMath;
using System.Collections;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

partial class Scene(CadDocument document,List<string> notices) {
    readonly List<object> items=[];
    readonly Dictionary<string,int> unsupported=[];
    readonly Dictionary<string,object> layers=[];
    readonly List<double[]> all=[];
    readonly Dictionary<Entity,string[]> visibility=[];
    readonly Dictionary<string,int> coverage=[];
    readonly Dictionary<string,Dictionary<string,int>> unsupportedByLayer=[];
    readonly Dictionary<string,int> invisibleByLayer=[];
    double factor=1;
    int count=0;
    static object? Get(object? o,string key)=>o is IDictionary<string,object?> map?(map.TryGetValue(key,out var value)?value:null):o?.GetType().GetProperty(key)?.GetValue(o);
    // Dictionary.GetValueOrDefault is unavailable in the Windows net48 host.
    static T ValueOrDefault<K,T>(Dictionary<K,T> values,K key) where K:notnull=>values.TryGetValue(key,out var value)?value:default!;
    static double Num(object? o,string key,double fallback=0)=>Get(o,key) is IConvertible v? v.ToDouble(CultureInfo.InvariantCulture):fallback;
    static (double x,double y) Point(object? o)=>(Num(o,"X"),Num(o,"Y"));
    static IEnumerable<object> Many(object? o)=>o is IEnumerable list?list.Cast<object>():[];
    static string F(double n)=>n.ToString("0.#####",CultureInfo.InvariantCulture);
    static double[] Mul(double[] a,double[] b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
    void Missing(string layer,string type,string[]? dependencies=null){
        unsupported[type]=ValueOrDefault(unsupported,type)+1;
        foreach(var name in (dependencies??[layer]).Distinct()){
            if(!unsupportedByLayer.TryGetValue(name,out var types))unsupportedByLayer[name]=types=[];
            types[type]=ValueOrDefault(types,type)+1;
        }
    }
    void RegisterLayers(){
        var model=document.Entities.GroupBy(e=>e.Layer?.Name??"0").ToDictionary(g=>g.Key,g=>g.Count());
        var paper=(document.Layouts?.ToArray()??[]).Where(l=>l.IsPaperSpace).SelectMany(l=>l.AssociatedBlock?.Entities??Enumerable.Empty<Entity>()).GroupBy(e=>e.Layer?.Name??"0").ToDictionary(g=>g.Key,g=>g.Count());
        var definitions=document.BlockRecords.Where(b=>b!=document.ModelSpace&&!(b.Layout?.IsPaperSpace??false)).SelectMany(b=>b.Entities).GroupBy(e=>e.Layer?.Name??"0").ToDictionary(g=>g.Key,g=>g.Count());
        foreach(var layer in document.Layers){
            bool frozen=(layer.Flags&LayerFlags.Frozen)!=0;
            layers[layer.Name]=new{name=layer.Name,visible=layer.IsOn&&!frozen,sourceOn=layer.IsOn,sourceFrozen=frozen,newViewportFrozen=(layer.Flags&LayerFlags.FrozenNewViewports)!=0,locked=(layer.Flags&LayerFlags.Locked)!=0,modelObjects=ValueOrDefault(model,layer.Name),paperObjects=ValueOrDefault(paper,layer.Name),definitionObjects=ValueOrDefault(definitions,layer.Name)};
        }
    }
    double[] At((double x,double y) p,double[] m)=>[(p.x*m[0]+p.y*m[2]+m[4])*factor,-(p.x*m[1]+p.y*m[3]+m[5])*factor];
    void Path(Entity e,IEnumerable<(double x,double y)> points,bool close,double[] m,string owner,string layer) {
        var ps=points.Select(p=>At(p,m)).Where(p=>Numbers.Finite(p[0])&&Numbers.Finite(p[1])).ToArray();
        if(ps.Length<2)return;
        all.AddRange(ps);
        var d="M"+string.Join(" L",ps.Select(p=>F(p[0])+","+F(p[1])))+(close?" Z":"");
        items.Add(new {id="g"+count++,owner,layer,visibilityLayers=ValueOrDefault(visibility,e)??[layer],kind="path",d,bounds=new[]{ps.Min(p=>p[0]),ps.Min(p=>p[1]),ps.Max(p=>p[0]),ps.Max(p=>p[1])}});
    }
    static IEnumerable<(double x,double y)> Curve(double cx,double cy,double rx,double ry,double a,double b,double rotation=0) {
        int n=Math.Max(8,Math.Min(120,(int)Math.Ceiling(Math.Abs(b-a)*18)));
        for(int k=0;k<=n;k++){var t=a+(b-a)*k/n;var x=rx*Math.Cos(t);var y=ry*Math.Sin(t);yield return(cx+x*Math.Cos(rotation)-y*Math.Sin(rotation),cy+x*Math.Sin(rotation)+y*Math.Cos(rotation));}
    }
    void Visit(IEnumerable<Entity> entities,double[] m,string? parent,string? owner,int depth=0,string[]? ancestors=null) {
        if(depth>24){unsupported["Deep block nesting"]=1;return;}
        foreach(var e in entities) {
            if(items.Count>120000)throw new Exception("Drawing exceeds 120,000 display entities. Import a floor-specific DWG.");
            string layer=e.Layer?.Name??"0";
            if(layer=="0"&&parent!=null)layer=parent;
            if(e.IsInvisible){foreach(var name in (ancestors??[]).Concat(new[]{layer}).Distinct())invisibleByLayer[name]=ValueOrDefault(invisibleByLayer,name)+1;continue;}
            var cadLayer=document.Layers.Contains(layer)?document.Layers[layer]:e.Layer;
            if(!layers.ContainsKey(layer))layers[layer]=new{name=layer,visible=(cadLayer?.IsOn??true)&&((cadLayer?.Flags??LayerFlags.None)&LayerFlags.Frozen)==0};
            visibility[e]=(ancestors??[]).Concat(new[]{layer}).Distinct().ToArray();
            string id=owner??e.Handle.ToString();
            var type=e.GetType().Name;
            try {
                if(TryAdvanced(e,m,id,layer,depth,visibility[e])) {coverage[type]=ValueOrDefault(coverage,type)+1;}
                else if(e is Insert ins) {
                    var basePoint=ins.Block.BlockEntity.BasePoint;
                    double c=Math.Cos(ins.Rotation),s=Math.Sin(ins.Rotation),sx=ins.XScale,sy=ins.YScale;
                    double[] t=[c*sx,s*sx,-s*sy,c*sy,ins.InsertPoint.X-c*sx*basePoint.X+s*sy*basePoint.Y,ins.InsertPoint.Y-s*sx*basePoint.X-c*sy*basePoint.Y];
                    Visit(ins.Block.Entities,Mul(m,t),layer,id,depth+1,visibility[e]);
                    Visit(ins.Attributes.Cast<Entity>(),m,layer,id,depth+1,visibility[e]);
                } else if(e is Line line) Path(e,[(line.StartPoint.X,line.StartPoint.Y),(line.EndPoint.X,line.EndPoint.Y)],false,m,id,layer);
                else if(e is Arc arc) {var end=arc.EndAngle;while(end<arc.StartAngle)end+=Math.PI*2;Path(e,Curve(arc.Center.X,arc.Center.Y,arc.Radius,arc.Radius,arc.StartAngle,end),false,m,id,layer);}
                else if(e is Circle circle) Path(e,Curve(circle.Center.X,circle.Center.Y,circle.Radius,circle.Radius,0,Math.PI*2),true,m,id,layer);
                else if(e is LwPolyline poly) {
                    var ps=new List<(double x,double y)>();var vv=poly.Vertices.ToArray();
                    for(int j=0;j<vv.Length;j++){
                        var v=vv[j];ps.Add((v.Location.X,v.Location.Y));
                        if(Math.Abs(v.Bulge)>1e-9&&(j<vv.Length-1||poly.IsClosed)){
                            var w=vv[(j+1)%vv.Length];double dx=w.Location.X-v.Location.X,dy=w.Location.Y-v.Location.Y,chord=Math.Sqrt(dx*dx+dy*dy),theta=4*Math.Atan(v.Bulge),dist=chord*(1-v.Bulge*v.Bulge)/(4*v.Bulge);
                            double cx=(v.Location.X+w.Location.X)/2-dy/chord*dist,cy=(v.Location.Y+w.Location.Y)/2+dx/chord*dist,r=chord*(1+v.Bulge*v.Bulge)/(4*Math.Abs(v.Bulge)),a=Math.Atan2(v.Location.Y-cy,v.Location.X-cx);
                            ps.AddRange(Curve(cx,cy,r,r,a,a+theta).Skip(1));
                        }
                    }Path(e,ps,poly.IsClosed,m,id,layer);
                } else if(type.StartsWith("Polyline")) Path(e,Many(Get(e,"Vertices")).Select(v=>Point(Get(v,"Location"))),System.Convert.ToBoolean(Get(e,"IsClosed")??false),m,id,layer);
                else if(e is TextEntity text) Text(e,text.Value,text.InsertPoint.X,text.InsertPoint.Y,text.Height,text.Rotation,m,id,layer);
                else if(e is MText mt) Text(e,mt.Value,mt.InsertPoint.X,mt.InsertPoint.Y,mt.Height,0,m,id,layer);
                else if(type=="Ellipse") {var center=Point(Get(e,"Center"));var axis=Point(Get(e,"MajorAxisEndPoint"));double a=Num(e,"StartParameter"),b=Num(e,"EndParameter",Math.PI*2),rx=Math.Sqrt(axis.x*axis.x+axis.y*axis.y);Path(e,Curve(center.x,center.y,rx,rx*Num(e,"RadiusRatio",1),a,b,Math.Atan2(axis.y,axis.x)),Math.Abs(b-a)>6.28,m,id,layer);}
                else Missing(layer,type,visibility[e]);
            } catch(Exception) {Missing(layer,type,visibility[e]);}
        }
    }
    void Text(Entity e,string value,double x,double y,double h,double r,double[] m,string owner,string layer){
        var t=Regex.Replace(value??"",@"\\P|\\p","\n");t=Regex.Replace(t,@"\\[A-Za-z][^;]*;","");t=t.Replace("{","").Replace("}","");
        if(string.IsNullOrWhiteSpace(t))return;
        var p=At((x,y),m);double height=Math.Max(1,h*factor*Math.Sqrt(m[0]*m[0]+m[1]*m[1]));
        all.Add(p);items.Add(new{id="g"+count++,owner,layer,visibilityLayers=ValueOrDefault(visibility,e)??[layer],kind="text",text=t,x=p[0],y=p[1],height,rotation=-(r+Math.Atan2(m[1],m[0]))*180/Math.PI,bounds=new[]{p[0],p[1]-height,p[0]+height*t.Length*.6,p[1]}});
    }
    public object Convert(){
        int units=(int)document.Header.InsUnits;
        factor=units switch{1=>25.4,2=>304.8,4=>1,5=>10,6=>1000,7=>1000000,_=>1};
        RegisterLayers();
        Visit(document.Entities,[1,0,0,1,0,0],null,null);
        if(items.Count==0)throw new Exception("No supported 2D model-space entities were found. Paper-space layouts and custom proxy objects may need an export from the source CAD.");
        return new {adapterVersion=4,layerInventoryVersion=1,sourceObjects=document.Entities.Select(e=>new{handle=e.Handle.ToString(),type=e.GetType().Name,layer=e.Layer?.Name??"0"}),items,layers=layers.Values,unsupportedByLayer,invisibleByLayer,layouts=(document.Layouts?.ToArray()??[]).Select(l=>new{name=l.Name,paperSpace=l.IsPaperSpace,entities=l.AssociatedBlock?.Entities.Count??0}),factor,unitsKnown=units is 1 or 2 or 4 or 5 or 6 or 7,units,version=document.Header.Version.ToString(),bounds=new[]{all.Min(p=>p[0]),all.Min(p=>p[1]),all.Max(p=>p[0]),all.Max(p=>p[1])},coverage,unsupported,warnings=notices.Distinct().Take(15),textNotice="CAD text uses browser fonts. Custom SHX/BigFont appearance is not guaranteed. Curves and hatch boundaries are sampled for display; original CAD bytes are retained for export."};
    }
}
