using ACadSharp.Entities;
using CSMath;

partial class Scene {
    bool TryAdvanced(Entity e,double[] m,string owner,string layer,int depth,string[] ancestors){
        if(e is Dimension dim){
            if(dim.Block==null||dim.Block.Entities.Count==0)return false;
            int start=items.Count;
            // DEFPOINTS in the cached dimension picture are editing control points.
            Visit(dim.Block.Entities.Where(v=>v is not ACadSharp.Entities.Point||!string.Equals(v.Layer?.Name,"DEFPOINTS",StringComparison.OrdinalIgnoreCase)),m,layer,owner,depth+1,ancestors);
            CompactDimension(start,dim.GetType().Name);return items.Count>start;
        }
        if(e is Solid solid){
            var points=new[]{solid.FirstCorner,solid.SecondCorner,solid.FourthCorner,solid.ThirdCorner}.Select(p=>(p.X,p.Y)).ToList();
            Compound(e,[points],Mul(m,Ocs(solid.Normal,0)),owner,layer,"solid","nonzero",null);return true;
        }
        if(e is Hatch hatch){
            if(hatch.IsDouble||System.Convert.ToBoolean(Get(hatch.GradientColor,"Enabled")??false))return false;
            // Let the pinned CAD library handle bulges, edge orientation and splines.
            var loops=hatch.Paths.Select(p=>p.GetPoints(120).Select(v=>(v.X,v.Y)).ToList()).ToList();
            if(loops.Count==0||loops.Any(p=>p.Count<3))return false;
            string style=hatch.Style.ToString();
            if(style!="Normal")loops=loops.Where((p,i)=>{int nesting=loops.Where((q,j)=>i!=j&&Inside(p[0],q)).Count();return style=="Ignore"?nesting==0:nesting<=1;}).ToList();
            var transform=Mul(m,Ocs(hatch.Normal,hatch.Elevation));
            var patterns=new List<object>();
            if(!hatch.IsSolid){
                if(hatch.Pattern?.Lines.Count is not >0)return false;
                foreach(var line in hatch.Pattern.Lines){
                    var b=At((line.BasePoint.X,line.BasePoint.Y),transform);var zero=At((0,0),transform);
                    var a=At((Math.Cos(line.Angle),Math.Sin(line.Angle)),transform);var o=At((line.Offset.X,line.Offset.Y),transform);
                    var axis=new[]{a[0]-zero[0],a[1]-zero[1]};var step=new[]{o[0]-zero[0],o[1]-zero[1]};
                    if(Math.Abs(axis[0]*step[1]-axis[1]*step[0])<1e-16)return false;
                    patterns.Add(new{basePoint=b,axis,step,dashes=line.DashLengths.ToArray()});
                }
            }
            Compound(e,loops,transform,owner,layer,hatch.IsSolid?"solid":"hatch","evenodd",patterns);return true;
        }
        return false;
    }
    void Compound(Entity e,List<List<(double x,double y)>> loops,double[] m,string owner,string layer,string fill,string rule,List<object>? patterns){
        var transformed=loops.Select(l=>l.Select(p=>At(p,m)).ToList()).ToList();
        if(rule=="nonzero")foreach(var ps in transformed){double area=0;for(int i=0;i<ps.Count;i++){var a=ps[i];var b=ps[(i+1)%ps.Count];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)ps.Reverse();}
        var vertices=transformed.SelectMany(l=>l).ToArray();if(vertices.Length<3||vertices.Any(p=>p.Any(v=>!Numbers.Finite(v))))throw new Exception("Invalid filled CAD geometry");
        all.AddRange(vertices);string d=string.Join(" ",transformed.Select(ps=>"M"+string.Join(" L",ps.Select(p=>F(p[0])+","+F(p[1])))+" Z"));
        items.Add(new{id="g"+count++,owner,layer,visibilityLayers=visibility.GetValueOrDefault(e)??[layer],kind="path",d,fill,fillRule=rule,patterns,sourceType=e.GetType().Name,bounds=new[]{vertices.Min(p=>p[0]),vertices.Min(p=>p[1]),vertices.Max(p=>p[0]),vertices.Max(p=>p[1])}});
    }
    void CompactDimension(int start,string sourceType){
        var generated=items.Skip(start).ToArray();items.RemoveRange(start,items.Count-start);
        var paths=generated.Where(p=>(string?)Get(p,"kind")=="path"&&(string?)Get(p,"fill")!="hatch");
        foreach(var group in paths.GroupBy(p=>string.Join("|",Get(p,"layer"),Get(p,"fill"),Get(p,"fillRule"),string.Join(";",(string[]?)Get(p,"visibilityLayers")??[])))){
            var first=group.First();var boxes=group.Select(p=>(double[])Get(p,"bounds")!).ToArray();
            var p=new Dictionary<string,object?>();foreach(var field in first.GetType().GetProperties())p[field.Name]=field.GetValue(first);
            p["d"]=string.Join(" ",group.Select(p=>Get(p,"d")));p["sourceType"]=sourceType;p["bounds"]=new[]{boxes.Min(b=>b[0]),boxes.Min(b=>b[1]),boxes.Max(b=>b[2]),boxes.Max(b=>b[3])};items.Add(p);
        }
        items.AddRange(generated.Where(p=>(string?)Get(p,"kind")!="path"||(string?)Get(p,"fill")=="hatch"));
    }
    static double[] Ocs(XYZ normal,double elevation){
        double length=Math.Sqrt(normal.X*normal.X+normal.Y*normal.Y+normal.Z*normal.Z);if(length<1e-12)return[1,0,0,1,0,0];
        double nx=normal.X/length,ny=normal.Y/length,nz=normal.Z/length;
        var ax=Math.Abs(nx)<1.0/64&&Math.Abs(ny)<1.0/64?new[]{nz,0.0,-nx}:new[]{-ny,nx,0.0};
        double al=Math.Sqrt(ax.Sum(v=>v*v));for(int i=0;i<3;i++)ax[i]/=al;
        var ay=new[]{ny*ax[2]-nz*ax[1],nz*ax[0]-nx*ax[2],nx*ax[1]-ny*ax[0]};
        return[ax[0],ax[1],ay[0],ay[1],nx*elevation,ny*elevation];
    }
    static bool Inside((double x,double y) p,List<(double x,double y)> loop){bool inside=false;for(int i=0,j=loop.Count-1;i<loop.Count;j=i++){var a=loop[i];var b=loop[j];if((a.y>p.y)!=(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
}
