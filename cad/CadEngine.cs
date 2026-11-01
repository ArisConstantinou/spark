using ACadSharp;
using ACadSharp.Entities;
using ACadSharp.IO;
using ACadSharp.Tables;
using CSMath;
using System.Globalization;
using System.IO;
using System.Text.Json;

public static class CadEngine {
 public static string Import(byte[] bytes,string format,bool inspect=false){
  if(format!="dwg"&&format!="dxf")throw new ArgumentException("Choose DWG or DXF.");
  CultureInfo.CurrentCulture=CultureInfo.InvariantCulture;
  using var input=new MemoryStream(bytes);var notices=new List<string>();
  void Notify(object? sender,NotificationEventArgs e){if(notices.Count<30&&e.NotificationType.ToString()!="None")notices.Add(e.Message);}
  var doc=format=="dxf"?DxfReader.Read(input,Notify):DwgReader.Read(input,Notify);
  return JsonSerializer.Serialize(inspect?CadInspection.Summarize(doc):new Scene(doc,notices).Convert());
 }
 public static byte[] Export(byte[] json,string format){
  if(format!="dwg"&&format!="dxf")throw new ArgumentException("Choose DWG or DXF.");
  using var parsed=JsonDocument.Parse(json);var request=parsed.RootElement;
  double factor=request.GetProperty("factor").GetDouble();if(!Numbers.Finite(factor)||factor<=0)throw new ArgumentException("Invalid drawing scale.");
  CadDocument doc;
  if(request.TryGetProperty("original",out var raw)&&!string.IsNullOrEmpty(raw.GetString())){
   using var original=new MemoryStream(System.Convert.FromBase64String(raw.GetString()!));
   doc=request.GetProperty("originalFormat").GetString()=="dxf"?DxfReader.Read(original):DwgReader.Read(original);
  }else{doc=new CadDocument();doc.Header.InsUnits=ACadSharp.Types.Units.UnitsType.Millimeters;}
  if(request.TryGetProperty("unitOverride",out var units)&&units.ValueKind==JsonValueKind.Number){int u=units.GetInt32();if(u is not (1 or 2 or 4 or 5 or 6 or 7))throw new ArgumentException("Unsupported unit override.");doc.Header.InsUnits=(ACadSharp.Types.Units.UnitsType)u;}
  ApplyMoves(doc,request,factor);
  var layer=new Layer("SPARKWORLD_ELECTRICAL");if(doc.Layers.Contains(layer.Name))layer=doc.Layers[layer.Name];else doc.Layers.Add(layer);
  foreach(var item in request.GetProperty("segments").EnumerateArray()){
   var a=item.GetProperty("a");var b=item.GetProperty("b");doc.Entities.Add(new Line{StartPoint=new XYZ(a[0].GetDouble()/factor,-a[1].GetDouble()/factor,0),EndPoint=new XYZ(b[0].GetDouble()/factor,-b[1].GetDouble()/factor,0),Layer=layer});
  }
  foreach(var item in request.GetProperty("labels").EnumerateArray())doc.Entities.Add(new TextEntity{InsertPoint=new XYZ(item.GetProperty("x").GetDouble()/factor,-item.GetProperty("y").GetDouble()/factor,0),Height=item.GetProperty("height").GetDouble()/factor,Value=item.GetProperty("text").GetString()??"",Layer=layer});
  using var output=new MemoryStream();if(format=="dxf"){using var writer=new DxfWriter(output,doc,false);writer.Write();}else{doc.Header.Version=ACadVersion.AC1032;using var writer=new DwgWriter(output,doc);writer.Write();}return output.ToArray();
 }
 static void ApplyMoves(CadDocument doc,JsonElement request,double factor){
  if(!request.TryGetProperty("cadMoves",out var moves))return;
  var source=doc.Entities.ToDictionary(e=>e.Handle.ToString(CultureInfo.InvariantCulture));
  foreach(var move in moves.EnumerateObject()){
   if(!source.TryGetValue(move.Name,out var entity))throw new ArgumentException("CAD object "+move.Name+" is not present in source model space.");
   double dx=move.Value.GetProperty("dx").GetDouble(),dy=move.Value.GetProperty("dy").GetDouble();
   if(!Numbers.Finite(dx)||!Numbers.Finite(dy)||Math.Abs(dx)>=1e12||Math.Abs(dy)>=1e12)throw new ArgumentException("Invalid CAD movement.");
   if(entity is Dimension dimension&&dimension.Block!=null){
    // A cached dimension picture is separate from its definition points. Clone
    // its block before translating it, so other source objects are unaffected.
    var block=(BlockRecord)dimension.Block.Clone();string name="SW_DIM_"+entity.Handle;int suffix=0;while(doc.BlockRecords.Contains(name))name="SW_DIM_"+entity.Handle+"_"+(++suffix);
    block.Name=name;doc.BlockRecords.Add(block);dimension.Block=block;
    foreach(var child in block.Entities)TranslateEntity(child,dx/factor,-dy/factor);
   }
   TranslateEntity(entity,dx/factor,-dy/factor);
  }
 }
 static void TranslateEntity(Entity entity,double wx,double wy){
  var translation=Transform.CreateTranslation(new XYZ(wx,wy,0));
  if(entity is Hatch hatch)TranslateHatch(hatch,wx,wy);
  else if(entity is Insert insert){
   // Translation must preserve mirrored scales and the stored block rotation.
   insert.InsertPoint=new XYZ(insert.InsertPoint.X+wx,insert.InsertPoint.Y+wy,insert.InsertPoint.Z);
   foreach(var attribute in insert.Attributes)attribute.ApplyTransform(translation);
  }else entity.ApplyTransform(translation);
 }
 static void TranslateHatch(Hatch hatch,double wx,double wy){
  // The library's general transform reapplies the pattern angle/scale and
  // translates its spacing vector. A translation must preserve both vectors.
  double length=Math.Sqrt(hatch.Normal.X*hatch.Normal.X+hatch.Normal.Y*hatch.Normal.Y+hatch.Normal.Z*hatch.Normal.Z);
  if(length<1e-12)throw new ArgumentException("Cannot move a hatch with an invalid normal.");
  double nx=hatch.Normal.X/length,ny=hatch.Normal.Y/length,nz=hatch.Normal.Z/length;
  var ax=Math.Abs(nx)<1.0/64&&Math.Abs(ny)<1.0/64?new XYZ(nz,0,-nx):new XYZ(-ny,nx,0);
  double al=Math.Sqrt(ax.X*ax.X+ax.Y*ax.Y+ax.Z*ax.Z);ax=new XYZ(ax.X/al,ax.Y/al,ax.Z/al);
  var ay=new XYZ(ny*ax.Z-nz*ax.Y,nz*ax.X-nx*ax.Z,nx*ax.Y-ny*ax.X);
  double u=wx*ax.X+wy*ax.Y,v=wx*ay.X+wy*ay.Y;
  var translation=Transform.CreateTranslation(new XYZ(u,v,0));
  foreach(var boundary in hatch.Paths)boundary.ApplyTransform(translation);
  hatch.Elevation+=wx*nx+wy*ny;
  if(hatch.Pattern!=null){hatch.Pattern=hatch.Pattern.Clone();foreach(var line in hatch.Pattern.Lines)line.BasePoint=new XY(line.BasePoint.X+u,line.BasePoint.Y+v);}
  for(int i=0;i<hatch.SeedPoints.Count;i++)hatch.SeedPoints[i]=new XY(hatch.SeedPoints[i].X+u,hatch.SeedPoints[i].Y+v);
 }
}
internal static class Numbers{public static bool Finite(double v)=>!double.IsNaN(v)&&!double.IsInfinity(v);}
#if NETFRAMEWORK
internal static class DictionaryCompatibility{
 public static TValue? GetValueOrDefault<TKey,TValue>(this Dictionary<TKey,TValue> map,TKey key)=>map.TryGetValue(key,out var value)?value:default;
}
#endif
